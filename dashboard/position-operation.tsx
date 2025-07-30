import { EventLog, ethers } from "ethers";
import pLimit from "p-limit";
import { getBlockTimestamp, convertBlockTimetoDate, withRetry, getTokenDecimals } from "./utils";
import { getTokensOwed, getTokenAmount } from "./pancake-position-mgr";
import { updatePositionRecord, getAllActivePositions, db } from "./db/utils";
import { LpOperationParams, LpStrategySnapshotParams } from "./db/type";
import { getTokenPriceManager } from "./token";
import { BSC_CG_NAME } from "./constant";
import logger from "./logger";
import { getPoolNameByDexType } from "./utils";

export async function insertOperationHisRecord(provider, priceMgr, pm, position, fromBlock, toBlock, filter, opType) {
    const chunkSize = 10000;
    const paramsList: LpOperationParams[] = [];
    for (let start = fromBlock; start <= toBlock; start += chunkSize) {
        const end = Math.min(start + chunkSize - 1, toBlock);
        const incEvents = await withRetry(() => pm.queryFilter(filter, start, end)) as EventLog[];
        for (const e of incEvents) {
            const blockTime = await withRetry(() => getBlockTimestamp(provider, e.blockNumber));
        const [ basePriceHis, quotePriceHis, baseDecimals, quoteDecimals] = await Promise.all([
                priceMgr.fetchTokenPrice(position.baseTokenAddress, convertBlockTimetoDate(blockTime)),
                priceMgr.fetchTokenPrice(position.quoteTokenAddress, convertBlockTimetoDate(blockTime)),
                getTokenDecimals(position.baseTokenAddress, provider),
                getTokenDecimals(position.quoteTokenAddress, provider)
            ]);
            const base_amount = position.baseTokenLocation === 'token0' ? e.args.amount0.toString() : e.args.amount1.toString();
            const quote_amount = position.baseTokenLocation === 'token0' ? e.args.amount1.toString() : e.args.amount0.toString();
            const params: LpOperationParams = {
                position_token_id: position.tokenId,
                op_type: opType,
                op_time: blockTime,
                pool_address: position.poolAddress,
                base_token_address: position.baseTokenAddress,
                quote_token_address: position.quoteTokenAddress,
                base_decimals: baseDecimals,
                quote_decimals: quoteDecimals,
                base_amount,
                base_price_usd: basePriceHis,
                quote_amount,
                quote_price_usd: quotePriceHis,
                liquidity: opType === 'Collect' ? '0' : e.args.liquidity.toString(),
                tx_hash: e.transactionHash,
                block_number: e.blockNumber
            };
            paramsList.push(params);
        }
    }
    // 批量写入数据库
    if (paramsList.length > 0) {
        const fields = Object.keys(paramsList[0]);
        const placeholders = fields.map(() => '?').join(', ');
        const insertQuery = `INSERT INTO lp_operations (${fields.join(', ')}) VALUES (${placeholders})`;
        const insertMany = db.transaction((rows: LpOperationParams[]) => {
            const stmt = db.prepare(insertQuery);
            for (const row of rows) {
                const values = fields.map(f => (row as any)[f]);
                stmt.run(...values);
            }
        });
        insertMany(paramsList);
    }
}

export async function trackLpTokenHistory(provider, pm: ethers.Contract, positions: any[], fromBlock: number, toBlock: number) {
    const priceMgr = getTokenPriceManager(BSC_CG_NAME);
    const limit = pLimit(8);
    await Promise.all(positions.map(position =>
        limit(async () => {
            const fromBlockNew = position.block_number || fromBlock;
            const filterInc = pm.filters.IncreaseLiquidity(position.tokenId);
            const filterDec = pm.filters.DecreaseLiquidity(position.tokenId);
            const filterCol = pm.filters.Collect(position.tokenId);
            await Promise.all([
                insertOperationHisRecord(provider, priceMgr, pm, position, fromBlockNew, toBlock, filterInc, 'IncreaseLiquidity'),
                insertOperationHisRecord(provider, priceMgr, pm, position, fromBlockNew, toBlock, filterDec, 'DecreaseLiquidity'),
                insertOperationHisRecord(provider, priceMgr, pm, position, fromBlockNew, toBlock, filterCol, 'Collect'),
            ]);
        })
    ));
    logger.info("\n✅ LP token operation history extraction completed.");
}

export async function updatePositionSummary(dexType, provider) {
    logger.info(`🔄 Updating position ${dexType} summary...`);
    const poolName = getPoolNameByDexType(dexType);
    const allActivePositions = await getAllActivePositions(poolName);
    for (const position of allActivePositions) {
        const { poolAddress, tokenId } = position;

        // 查询所有操作
        const ops = db.prepare(
            `SELECT * FROM lp_operations WHERE pool_address = ? AND position_token_id = ? ORDER BY block_number ASC`
        ).all(poolAddress, tokenId);

        // 汇总
        let currentLiquidity = 0n;
        let position_duration_h = 0;
        let is_active = 0;
        let endBlockNumber = 0;
        let total_add_base_amount = 0, total_add_quote_amount = 0;
        let total_add_base_value_usd = 0, total_add_quote_value_usd = 0;
        let total_remove_base_amount = 0, total_remove_quote_amount = 0;
        let total_remove_base_value_usd = 0, total_remove_quote_value_usd = 0;
        let total_fee_claim_base_amount = 0, total_fee_claim_quote_amount = 0;
        let total_fee_claim_base_value_usd = 0, total_fee_claim_quote_value_usd = 0;
        let unclaimed_fee_base_amount = 0, unclaimed_fee_quote_amount = 0;
        let unclaimed_fee_base_value_usd = 0, unclaimed_fee_quote_value_usd = 0;
        let unclaimed_fee_value_usd = 0, current_base_amount = 0;
        let current_quote_amount = 0, current_position_value_usd = 0;

        const priceMgr = getTokenPriceManager(BSC_CG_NAME);
        const date = convertBlockTimetoDate(Date.now()); // 使用当前时间作为日期
        // get current base and quote prices
        const [basePrice, quotePrice, [tokenOwed0, tokenOwed1], [amount1, amount2]] = await Promise.all([
            priceMgr.fetchTokenPrice(position.baseTokenAddress, date),
            priceMgr.fetchTokenPrice(position.quoteTokenAddress, date),
            getTokensOwed(poolAddress, tokenId, dexType),
            getTokenAmount(poolAddress, tokenId, dexType)

        ]);
        for (const op of ops) {
            if (op.op_type === "IncreaseLiquidity") {
                total_add_base_amount = total_add_base_amount + (op.base_amount / (10 ** op.base_decimals));
                total_add_quote_amount = total_add_quote_amount + (op.quote_amount / (10 ** op.quote_decimals));
                total_add_base_value_usd = total_add_base_value_usd + ((op.base_amount / (10 ** op.base_decimals)) * (op.base_price_usd || 0));
                total_add_quote_value_usd = total_add_quote_value_usd + ((op.quote_amount / (10 ** op.quote_decimals)) * (op.quote_price_usd || 0));
                currentLiquidity += BigInt(op.liquidity);
            }
            if (op.op_type === "DecreaseLiquidity") {
                total_remove_base_amount = total_remove_base_amount + (op.base_amount / (10 ** op.base_decimals));
                total_remove_quote_amount = total_remove_quote_amount + (op.quote_amount / (10 ** op.quote_decimals));
                currentLiquidity -= BigInt(op.liquidity);
                is_active = currentLiquidity > 0n ? 1 : 0;
                if (!is_active) {
                    endBlockNumber = op.block_number;
                }
                total_remove_base_value_usd = total_remove_base_amount * op.base_price_usd || 0;
                total_remove_quote_value_usd = total_remove_quote_amount * op.quote_price_usd || 0;
            }
            if (op.op_type === "Collect") {
                total_fee_claim_base_amount = total_fee_claim_base_amount + (op.base_amount / (10 ** op.base_decimals));
                total_fee_claim_quote_amount = total_fee_claim_quote_amount + (op.quote_amount / (10 ** op.quote_decimals));
                total_fee_claim_base_value_usd = total_fee_claim_base_amount * op.base_price_usd || 0;
                total_fee_claim_quote_value_usd = total_fee_claim_quote_amount * op.quote_price_usd || 0;
            }
        }
        is_active = currentLiquidity > 0n ? 1 : 0;
        
        unclaimed_fee_base_amount = tokenOwed0.address === position.baseTokenAddress ? tokenOwed0.amount : tokenOwed1.amount;
        unclaimed_fee_quote_amount = tokenOwed0.address === position.quoteTokenAddress ? tokenOwed0.amount : tokenOwed1.amount;
        current_base_amount = amount1.address === position.baseTokenAddress ? amount1.amount : amount2.amount;
        current_quote_amount = amount1.address === position.quoteTokenAddress ? amount1.amount : amount2.amount;
        current_position_value_usd = (current_base_amount * basePrice) + (current_quote_amount * quotePrice) || 0;

        if (is_active) {
            position_duration_h = Math.floor((Date.now() - new Date(position.createTime).getTime()) / (1000 * 60 * 60));
        } else {
            const endTime = await withRetry(() => getBlockTimestamp(provider, endBlockNumber));
            position_duration_h = Math.floor((new Date(endTime).getTime() - new Date(position.createTime).getTime()) / (1000 * 60 * 60));
        }
        
        const total_add_value_usd = total_add_base_value_usd + total_add_quote_value_usd;
        const total_fee_claim_value_usd = total_fee_claim_base_value_usd + total_fee_claim_quote_value_usd;
        const total_remove_value_usd = total_remove_base_value_usd + total_remove_quote_value_usd;
        unclaimed_fee_base_value_usd = unclaimed_fee_base_amount * basePrice || 0;
        unclaimed_fee_quote_value_usd = unclaimed_fee_quote_amount * quotePrice || 0;
        unclaimed_fee_value_usd = unclaimed_fee_base_value_usd + unclaimed_fee_quote_value_usd;
        const pnl_total_usd = unclaimed_fee_value_usd + total_fee_claim_value_usd + current_position_value_usd - (total_add_value_usd);
        const pnl_total_percentage = total_add_value_usd > 0 ? (pnl_total_usd / total_add_value_usd) * 100 : 0;

        
        const params: LpStrategySnapshotParams = {
            query_time: new Date().toString(),
            pool_address: poolAddress,
            position_token_id: tokenId,
            pool_name: poolName,
            base_price_usd: basePrice,
            quote_price_usd: quotePrice,
            total_add_base_amount,
            total_add_quote_amount,
            total_add_base_value_usd,
            total_add_quote_value_usd,
            total_add_value_usd,
            total_remove_base_amount,
            total_remove_quote_amount,
            total_remove_base_value_usd,
            total_remove_quote_value_usd,
            total_remove_value_usd,
            total_fee_claim_base_amount,
            total_fee_claim_quote_amount,
            total_fee_claim_base_value_usd,
            total_fee_claim_quote_value_usd,
            total_fee_claim_value_usd,
            unclaimed_fee_base_amount,
            unclaimed_fee_quote_amount,
            unclaimed_fee_base_value_usd,
            unclaimed_fee_quote_value_usd,
            unclaimed_fee_value_usd,
            current_base_amount,
            current_quote_amount,
            current_position_value_usd,
            pnl_total_usd,
            pnl_total_percentage,
            is_active,
            position_duration_h,
            end_block_number: endBlockNumber,
            
        };
        await updatePositionRecord(params);
    }
    logger.info(`✅ Position ${dexType} summary updated.`);
}
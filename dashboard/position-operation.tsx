import { EventLog } from "ethers";
import pLimit from "p-limit";
import { getBlockTimestamp, convertBlockTimetoDate, withRetry } from "./utils";
import { updatePositionRecord, getAllActivePositions, db } from "./db/utils";
import { LpOperationParams, LpStrategySnapshotParams } from "./db/type";
import { getTokenPriceManager } from "./token-price";
import { BSC_CG_NAME } from "./constant";

export async function insertOperationHisRecord(provider, priceMgr, pm, position, fromBlock, toBlock, filter, opType) {
    const chunkSize = 10000;
    const paramsList: LpOperationParams[] = [];
    for (let start = fromBlock; start <= toBlock; start += chunkSize) {
        const end = Math.min(start + chunkSize - 1, toBlock);
        const incEvents = await withRetry(() => pm.queryFilter(filter, start, end)) as EventLog[];
        for (const e of incEvents) {
            const blockTime = await withRetry(() => getBlockTimestamp(provider, e.blockNumber));
            const [basePrice, quotePrice] = await Promise.all([
                priceMgr.fetchTokenPrice(position.baseTokenAddress, convertBlockTimetoDate(blockTime)),
                priceMgr.fetchTokenPrice(position.quoteTokenAddress, convertBlockTimetoDate(blockTime))
            ]);
            const params: LpOperationParams = {
                position_token_id: position.tokenId,
                op_type: opType,
                op_time: blockTime,
                pool_address: position.poolAddress,
                base_token_address: position.baseTokenAddress,
                quote_token_address: position.quoteTokenAddress,
                base_amount: e.args.amount0.toString(),
                base_price_usd: basePrice,
                quote_amount: e.args.amount1.toString(),
                quote_price_usd: quotePrice,
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

export async function trackLpTokenHistory(provider, pm, positions: any[], fromBlock: number, toBlock: number) {
    const priceMgr = getTokenPriceManager(BSC_CG_NAME);
    const limit = pLimit(10);
    await Promise.all(positions.map(position =>
        limit(async () => {
            const fromBlockNew = position.block_number || fromBlock;
            const filterInc = pm.filters.IncreaseLiquidity(position.tokenId);
            const filterDec = pm.filters.DecreaseLiquidity(position.tokenId);
            const filterCol = pm.filters.Collect(position.tokenId);
            await Promise.all([
                insertOperationHisRecord(provider, priceMgr, pm, position, fromBlockNew, toBlock, filterInc, 'IncreaseLiquidity'),
                insertOperationHisRecord(provider, priceMgr, pm, position, fromBlockNew, toBlock, filterDec, 'DecreaseLiquidity'),
                insertOperationHisRecord(provider, priceMgr, pm, position, fromBlockNew, toBlock, filterCol, 'Collect')
            ]);
        })
    ));
    console.log("\n✅ LP token operation history extraction completed.");
}

export async function updatePositionSummury(chain: string, pm: any, fromBlock: number, latestBlock: number) {
    const allActivePositions = await getAllActivePositions();
    for (const position of allActivePositions) {
        const { poolAddress, tokenId, poolName } = position;

        // 查询所有操作
        const ops = db.prepare(
            `SELECT * FROM lp_operations WHERE pool_address = ? AND position_token_id = ?`
        ).all(poolAddress, tokenId);

        // 汇总
        let total_add_base_amount = 0, total_add_quote_amount = 0;
        let total_add_base_value_usd = 0, total_add_quote_value_usd = 0;
        let total_remove_base_amount = 0, total_remove_quote_amount = 0;
        let total_remove_base_value_usd = 0, total_remove_quote_value_usd = 0;
        let total_fee_claim_base_amount = 0, total_fee_claim_quote_amount = 0;
        let total_fee_claim_base_value_usd = 0, total_fee_claim_quote_value_usd = 0;

        for (const op of ops) {
            if (op.op_type === "IncreaseLiquidity") {
                total_add_base_amount += op.base_amount || 0;
                total_add_quote_amount += op.quote_amount || 0;
                total_add_base_value_usd += (op.base_amount || 0) * (op.base_price_usd || 0);
                total_add_quote_value_usd += (op.quote_amount || 0) * (op.quote_price_usd || 0);
            }
            if (op.op_type === "DecreaseLiquidity") {
                total_remove_base_amount += op.base_amount || 0;
                total_remove_quote_amount += op.quote_amount || 0;
                total_remove_base_value_usd += (op.base_amount || 0) * (op.base_price_usd || 0);
                total_remove_quote_value_usd += (op.quote_amount || 0) * (op.quote_price_usd || 0);
            }
            if (op.op_type === "Collect") {
                total_fee_claim_base_amount += op.base_amount || 0;
                total_fee_claim_quote_amount += op.quote_amount || 0;
                total_fee_claim_base_value_usd += (op.base_amount || 0) * (op.base_price_usd || 0);
                total_fee_claim_quote_value_usd += (op.quote_amount || 0) * (op.quote_price_usd || 0);
            }
        }

        const params: LpStrategySnapshotParams = {
            query_time: new Date().toISOString(),
            pool_address: poolAddress,
            position_token_id: tokenId,
            pool_name: poolName,
            total_add_base_amount,
            total_add_quote_amount,
            total_add_base_value_usd,
            total_add_quote_value_usd,
            total_remove_base_amount,
            total_remove_quote_amount,
            total_remove_base_value_usd,
            total_remove_quote_value_usd,
            total_fee_claim_base_amount,
            total_fee_claim_quote_amount,
            total_fee_claim_base_value_usd,
            total_fee_claim_quote_value_usd,
        };

        await updatePositionRecord(params);
    }
}
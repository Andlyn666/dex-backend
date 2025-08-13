import { ethers, EventLog } from "ethers";
import pLimit from "p-limit";
import logger from "./logger";
import ERC20ABI from "../dex/abi/ERC20.json" with { type: 'json' };
import V3PoolABI from "../dex/abi/PancakeV3Pool.json" with { type: 'json' };
import { LpStrategySnapshotParams } from "./db/type";
import { insertPositionRecord } from "./db/queries";
import { getPoolNameByDexType, withRetry,  getBlockTimestamp, getBaseAndQuoteToken} from "./utils";
import { MINT_EVENT_TOPIC } from "./constant";

const poolInfoCache = new Map<string, {
    token0: string,
    token1: string,
    fee: number,
    symbol0: string,
    symbol1: string
}>();

export async function insertBasicPositionRecord(provider: any, tokenId: string, instance: any, mintEvent: any, user: string) {
    const positionInfo = await getPositionInfo(provider, tokenId, mintEvent);
    if (!positionInfo) {
        throw new Error(`Failed to get position info for tokenId ${tokenId}`);
    }

    const poolName = getPoolNameByDexType(instance.dex_type);
    const tokenPair = getBaseAndQuoteToken(
        positionInfo.token0,
        positionInfo.token1,
        instance.chain
    );
    const params: LpStrategySnapshotParams = {
        pool_address: positionInfo.poolAddress,
        position_token_id: Number(tokenId),
        pool_name: poolName,
        pair_name: positionInfo.pairName,
        position_create_time: positionInfo.createTime ? positionInfo.createTime: '',
        query_time: new Date().toISOString(),
        is_active: 1,
        block_number: mintEvent.blockNumber,
        base_token_address: tokenPair.base,
        quote_token_address: tokenPair.quote,
        base_token_location: tokenPair.base === positionInfo.token0 ? 'token0' : 'token1',
        owner: user,
    };
    await insertPositionRecord(params);
}

export async function processInstancePositions(instance: any, provider: ethers.Provider, pm: ethers.Contract, fromBlock: number, latestBlock: number) {
    logger.info(`\n🟢 Chain: ${instance.chain} | PM: ${instance.position_manager_address} from ${fromBlock} to ${latestBlock}`);
    const limit = pLimit(8); 
    await Promise.all(instance.users_to_monitor.map(async (user: string) => {
        logger.info(`  🔍 Checking user: ${user}`);
        const filter = pm.filters.Transfer(ethers.ZeroAddress, user);
        const chunkSize = 10000;
        const chunkPromises: Promise<EventLog[]>[] = [];
        for (let start = fromBlock; start <= latestBlock; start += chunkSize) {
            const end = Math.min(start + chunkSize - 1, latestBlock);
            chunkPromises.push(
                limit(() => pm.queryFilter(filter, start, end) as Promise<EventLog[]>)
            );
        }
        // 并发获取所有chunk事件
        const chunkResults = await Promise.all(chunkPromises);
        const foundEvents = chunkResults.flat();

        // 事件处理也可并发
        await Promise.all(foundEvents.map(event =>
            limit(async () => {
                const tokenId = (event as EventLog).args?.tokenId.toString();
                logger.info(`    🔎 Processing tokenId: ${tokenId}`);
                await insertBasicPositionRecord(provider, tokenId, instance, event, user);
            })
        ));
    }));
    logger.info(`  ✅ Finished processing positions for ${instance.chain}`);
}

export async function GetPoolAndTickInfoFromTx(
    provider: ethers.Provider,
    txHash: string
): Promise<{
    poolAddress: string,
    tickLower: number,
    tickUpper: number
} | null> {
    const receipt = await withRetry(() => provider.getTransactionReceipt(txHash));
    if (!receipt) {
        throw new Error(`⚠️ Cannot find receipt for ${txHash}`);
    }

    for (const log of receipt.logs) {
        if (log.topics[0] === MINT_EVENT_TOPIC) {
            const poolAddress = log.address;
            const tickLower = Number(log.topics[2]);
            const tickUpper = Number(log.topics[3]);
            return {
                poolAddress,
                tickLower,
                tickUpper
            };
        }
    }

    throw new Error(`⚠️ No Mint event found in tx ${txHash}`);
    return null;
}
async function GetPoolInfo(poolAddress: string, provider: any) : Promise<{
    token0: string,
    token1: string,
    fee: number,
    symbol0: string,
    symbol1: string}> {
    const poolContract = new ethers.Contract(poolAddress, V3PoolABI, provider);
        const [token0, token1, fee] = await Promise.all([
            poolContract.token0(),
            poolContract.token1(),
            poolContract.fee(),
        ]);
        const token0Contract = new ethers.Contract(token0, ERC20ABI, provider);
        const token1Contract = new ethers.Contract(token1, ERC20ABI, provider);
        const [symbol0, symbol1] = await Promise.all([
            token0Contract.symbol(),
            token1Contract.symbol(),
        ]);
        return {
            token0,
            token1,
            fee,
            symbol0,
            symbol1
        };
}
async function getPositionInfo(provider, tokenId: string, mintEvent: any) {

    const poolAndTickInfo = await GetPoolAndTickInfoFromTx(provider, mintEvent.transactionHash);
    if (!poolAndTickInfo) {
        throw new Error(`⚠️ Failed to get pool info for tokenId ${tokenId}`);
    }
    let cached = poolInfoCache.get(poolAndTickInfo.poolAddress);
    if (!cached) {
        cached = await withRetry( 
            () => GetPoolInfo(poolAndTickInfo.poolAddress, provider));
        poolInfoCache.set(poolAndTickInfo.poolAddress, cached);
    }
    const pairName = `${cached.symbol0}/${cached.symbol1}`;

    let createTime = await getBlockTimestamp(provider, mintEvent.blockNumber);
    return {
        poolAddress: poolAndTickInfo.poolAddress,
        token0: cached.token0,
        token1: cached.token1,
        fee: cached.fee,
        symbol0: cached.symbol0,
        symbol1: cached.symbol1,
        tickLower: poolAndTickInfo.tickLower,
        tickUpper: poolAndTickInfo.tickUpper,
        pairName,
        createTime,
    };
}

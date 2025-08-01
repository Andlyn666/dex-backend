import { ethers, EventLog } from "ethers";
import pLimit from "p-limit";
import logger from "./logger";
import { getParamValue, getAllActivePositions, upsertParamValue } from "./db/utils";
import { insertBasicPositionRecord} from "./position";
import { trackLpTokenHistory, updatePositionSummary } from "./position-operation";
import { getPoolNameByDexType } from "./utils";
import config from "./config.json" with { type: "json" };
import PositionManagerABI from "../dex/abi/NonfungiblePositionManager.json" with { type: 'json' };
import dotenv  from "dotenv";

async function processInstancePositions(instance: any, provider: ethers.Provider, pm: ethers.Contract, fromBlock: number, latestBlock: number) {
    logger.info(`\n🟢 Chain: ${instance.chain} | PM: ${instance.position_manager_address}`);
    const limit = pLimit(8); // 控制chunk并发数，避免RPC压力过大
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
                await insertBasicPositionRecord(provider, tokenId, instance, event);
            })
        ));
    }));
    logger.info(`  ✅ Finished processing positions for ${instance.chain}`);
}

async function updatePositionOperations(provider: any, pm: any, fromBlock: number, latestBlock: number, instance: any) {

    logger.info('🔄 Updating position operations...');
    const poolName = getPoolNameByDexType(instance.dex_type);
    const allActivePositions = await getAllActivePositions(poolName);
    logger.info(`Found ${allActivePositions.length} active positions in ${poolName}`);
    await trackLpTokenHistory(provider, pm, allActivePositions, fromBlock, latestBlock, instance);
    logger.info('✅ Position operations updated successfully');
}


async function main() {
    dotenv.config();
    for (const instance of config.instances) {
      const provider = new ethers.JsonRpcProvider(instance.rpc_url);
      const pm = new ethers.Contract(instance.position_manager_address, PositionManagerABI, provider);
      const fromBlock = Number(await getParamValue("last_listen_block_bsc_"+ instance.dex_type)) || 52000000;
      const latestBlock = 53000000;
      await processInstancePositions(instance, provider, pm, fromBlock, latestBlock);
      await updatePositionOperations(provider, pm, fromBlock, latestBlock, instance);
      await updatePositionSummary(instance.dex_type);
      await upsertParamValue("last_listen_block_bsc_"+ instance.dex_type, latestBlock.toString());
    }
    
}

main().catch(error => {
  logger.error("Error in main function:", error);
});
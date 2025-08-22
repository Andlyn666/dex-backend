import { ethers } from "ethers";
import { ChainId } from "@pancakeswap/chains";
import logger from "./logger";
import { getParamValue, getAllActivePositions, upsertParamValue } from "./db/queries";
import { processInstancePositions } from "./position";
import { trackLpTokenHistory, updatePositionSummary } from "./position-operation";
import { getPoolNameByDexType, batchUpdatePoolInfo } from "./utils";
import config from "./config.json" with { type: "json" };
import PositionManagerABI from "../dex/abi/NonfungiblePositionManager.json" with { type: 'json' };
import { killAnvilFork, startAnvilFork } from "./pancake-position-mgr";
import dotenv  from "dotenv";

async function updatePositionOperations(provider: any, pm: any, fromBlock: number, latestBlock: number, instance: any) {

    logger.info('🔄 Updating position operations...');
    const poolName = getPoolNameByDexType(instance.dex_type);
    const allActivePositions = await getAllActivePositions(poolName);
    logger.info(`Found ${allActivePositions.length} active positions in ${poolName}`);
    await trackLpTokenHistory(provider, pm, allActivePositions, fromBlock, latestBlock);
    logger.info('✅ Position operations updated successfully');
}

async function main() {
    dotenv.config();
    for (const instance of config.instances) {
      const provider = new ethers.JsonRpcProvider(instance.rpc_url, { chainId: ChainId.BSC, name: 'BSC' }, {staticNetwork: true});
      const pm = new ethers.Contract(instance.position_manager_address, PositionManagerABI, provider);
      const fromBlock = Number(await getParamValue("last_listen_block_bsc_"+ instance.dex_type)) || 57000000;
      const latestBlock = await provider.getBlockNumber();
      await processInstancePositions(instance, provider, pm, fromBlock, latestBlock);
      await updatePositionOperations(provider, pm, fromBlock, latestBlock, instance);
      await updatePositionSummary(instance.dex_type, provider, latestBlock);
      await upsertParamValue("last_listen_block_bsc_"+ instance.dex_type, latestBlock.toString());
      await batchUpdatePoolInfo(instance.dex_type, provider);
    }
}

async function runMainLoop() {
  while (true) {
    try {
      await main();
    } catch (error) {
      logger.error("Error in main function:", error);
    }
    // 等待 30 秒
    await new Promise(resolve => setTimeout(resolve, 30000));
  }
}

runMainLoop();

// async function runMainLoop() {
//     try {
//         await main();
//     } catch (error) {
//         logger.error("Error in main function:", error);
//     }
// }

// runMainLoop();
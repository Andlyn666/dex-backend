import dotenv from 'dotenv'
import { ethers } from 'ethers';
import { exec, spawn } from "child_process";
import util from "util";

import NonfungiblePositionManagerABI from '../dex/abi/NonfungiblePositionManager.json' with { type: 'json' };
import { PositionMath, PositionLibrary, TickLibrary } from '@pancakeswap/v3-sdk';
import PoolABI from '../dex/abi/PancakeV3Pool.json' with { type: 'json' };
import logger from './logger';

dotenv.config();
const execAsync = util.promisify(exec);
let anvilProcess: ReturnType<typeof spawn> | null = null;


export class PancakePositionWatcher {
  rpcUrl: string;
  positionManager: string;
  decimalCache: Map<string, number>;
  provider: ethers.JsonRpcProvider;
  contract: ethers.Contract;
  poolAbi: any;
  
  constructor(rpcUrl, positionManager, poolAbi) {
    this.rpcUrl = rpcUrl;
    this.positionManager = positionManager;
    this.decimalCache = new Map();
    this.provider = new ethers.JsonRpcProvider(rpcUrl, { name: 'bsc', chainId: 56 });
    this.contract = new ethers.Contract(
      positionManager,
      NonfungiblePositionManagerABI,
      this.provider
    );
    this.poolAbi = poolAbi;
  }

async getTokenAmountWithAddress(tokenId, poolAddress) {
  try {
    const poolMgrContract = new ethers.Contract(this.positionManager, NonfungiblePositionManagerABI, this.provider);
    const position = await this.getPositionInfo(tokenId, poolMgrContract);
    if (!position || !position.tickLower) {
      logger.warn(`Position not found for tokenId ${tokenId}`);
      return [{address: '', amount: 0}, {address: '', amount: 0}];
    }
    const contract = new ethers.Contract(poolAddress, this.poolAbi, this.provider);
    const pool = await this.getPoolInfo(position, contract);
    const tickCurrent = Number(pool.tick);
    const tickLower = Number(position.tickLower);
    const tickUpper = Number(position.tickUpper);
    const sqrtRatioX96 = BigInt(pool.sqrtRatioX96);
    const liquidity = BigInt(position.liquidity);

    // Get decimals for both tokens (cached)
    const decimals0 = await this.getTokenDecimals(position.token0);
    const decimals1 = await this.getTokenDecimals(position.token1);

    // Calculate token amounts
    const token0Amount = PositionMath.getToken0Amount(tickCurrent, tickLower, tickUpper, sqrtRatioX96, liquidity);
    const token1Amount = PositionMath.getToken1Amount(tickCurrent, tickLower, tickUpper, sqrtRatioX96, liquidity);

    // Convert to human-readable values
    const humanToken0Amount = Number(token0Amount) / (10 ** decimals0);
    const humanToken1Amount = Number(token1Amount) / (10 ** decimals1);

    return [{address: position.token0, amount: humanToken0Amount}, {address: position.token1, amount: humanToken1Amount}];
  } catch (error) {
    logger.error(`Error getting token amounts for tokenId ${tokenId}:`, error);
    return [{address: '', amount: 0}, {address: '', amount: 0}];
  }
}

async getTokenDecimals(tokenAddress) {
    if (!this.decimalCache) {
      this.decimalCache = new Map();
    }
    if (this.decimalCache.has(tokenAddress)) {
      return Number(this.decimalCache.get(tokenAddress));
    }
    const ERC20_ABI = [
      "function decimals() view returns (uint8)"
    ];
    const tokenContract = new ethers.Contract(tokenAddress, ERC20_ABI, this.provider);
    const decimals = await tokenContract.decimals();
    this.decimalCache.set(tokenAddress,Number(decimals));
    return Number(decimals);
}
async getTokensOwedWithAddress(tokenId, poolAddress) {
  try {
    const poolMgrContract = new ethers.Contract(this.positionManager, NonfungiblePositionManagerABI, this.provider);
    const position = await this.getPositionInfo(tokenId, poolMgrContract);
    if (!position || !position.tickLower) {
      logger.warn(`Position not found for tokenId ${tokenId}`);
      return [{address: '', amount: 0}, {address: '', amount: 0}];
    }
    const contract = new ethers.Contract(poolAddress, PoolABI, this.provider);
    const pool = await this.getPoolInfo(position, contract);
    const tickCurrent = pool.tick;
    const [tickLowerData, tickUpperData] = await Promise.all([
      this.getTickData(position.tickLower, contract),
      this.getTickData(position.tickUpper, contract)
    ]);
    if (!tickLowerData || !tickUpperData) {
      logger.warn('Tick data not found for tickLower or tickUpper');
      return [{address: '', amount: 0}, {address: '', amount: 0}];
    }
    const feeGrowthOutside0Lower = BigInt(tickLowerData.feeGrowthOutside0X128);
    const feeGrowthOutside1Lower = BigInt(tickLowerData.feeGrowthOutside1X128);
    const feeGrowthOutside0Upper = BigInt(tickUpperData.feeGrowthOutside0X128);
    const feeGrowthOutside1Upper = BigInt(tickUpperData.feeGrowthOutside1X128);
    const feeGrowthGlobal0X128 = BigInt(pool.feeGrowthGlobal0X128);
    const feeGrowthGlobal1X128 = BigInt(pool.feeGrowthGlobal1X128);

    const feeGrowthInside = TickLibrary.getFeeGrowthInside(
      { feeGrowthOutside0X128: feeGrowthOutside0Lower, feeGrowthOutside1X128: feeGrowthOutside1Lower },
      { feeGrowthOutside0X128: feeGrowthOutside0Upper, feeGrowthOutside1X128: feeGrowthOutside1Upper },
      position.tickLower,
      position.tickUpper,
      tickCurrent,
      feeGrowthGlobal0X128,
      feeGrowthGlobal1X128
    );

    let [tokensOwed0, tokensOwed1] = PositionLibrary.getTokensOwed(
      BigInt(position.feeGrowthInside0LastX128),
      BigInt(position.feeGrowthInside1LastX128),
      BigInt(position.liquidity),
      BigInt(feeGrowthInside[0]),
      BigInt(feeGrowthInside[1]));
    tokensOwed0 = tokensOwed0 + BigInt(position.tokensOwed0);
    tokensOwed1 = tokensOwed1 + BigInt(position.tokensOwed1);

    // Fetch and cache decimals
    const decimals0 = await this.getTokenDecimals(position.token0);
    const decimals1 = await this.getTokenDecimals(position.token1);

    // Convert to human-readable values
    const humanOwed0 = Number(tokensOwed0) / (10 ** decimals0);
    const humanOwed1 = Number(tokensOwed1) / (10 ** decimals1);

    return [{address: position.token0, amount: humanOwed0}, {address: position.token1, amount: humanOwed1}];
  } catch (error) {
    logger.error(`Error getting tokens owed for tokenId ${tokenId}:`, error);
  }
  return [{address: '', amount: 0}, {address: '', amount: 0}];
}

  async getPositionInfo(tokenId, contract) {
    let info;
    try {
      const pos = await contract.positions(BigInt(tokenId));
      info = {
        nonce: pos.nonce.toString(),
        operator: pos.operator,
        token0: pos.token0,
        token1: pos.token1,
        fee: pos.fee,
        tickLower: Number(pos.tickLower),
        tickUpper: Number(pos.tickUpper),
        liquidity: pos.liquidity.toString(),
        feeGrowthInside0LastX128: pos.feeGrowthInside0LastX128.toString(),
        feeGrowthInside1LastX128: pos.feeGrowthInside1LastX128.toString(),
        tokensOwed0: pos.tokensOwed0.toString(),
        tokensOwed1: pos.tokensOwed1.toString(),
      };
    } catch (error) {
      logger.error(`Error fetching position info for tokenId ${tokenId}:`, error);
    }
    return info;
  }

  // Use Promise.all to fetch on-chain data in parallel and wait for all before proceeding
  async getPoolInfo(pos, contract) {
    
    let pool;
    try {
      // Fetch slot0 and fee growths in parallel
      const [poolInfo, feeGrowthGlobal0X128, feeGrowthGlobal1X128, tickLowerData, tickUpperData] = await Promise.all([
        contract.slot0(),
        contract.feeGrowthGlobal0X128(),
        contract.feeGrowthGlobal1X128(),
        this.getTickData(Number(pos.tickLower), contract),
        this.getTickData(Number(pos.tickUpper), contract)
      ]);
      pool = {
        sqrtRatioX96: poolInfo.sqrtPriceX96.toString(),
        tick: poolInfo.tick,
        feeGrowthGlobal0X128: feeGrowthGlobal0X128,
        feeGrowthGlobal1X128: feeGrowthGlobal1X128,
        tickLower: tickLowerData,
        tickUpper: tickUpperData
      }
    } catch (error) {
      logger.error(`Error fetching pool info for tokenId ${pos.tokenId}:`, error);
    }
    return pool;
  }
  async getTickData(tick, contract) {
    const tickData = await contract.ticks(tick);
    return tickData
  }
}


export async function initWatcher(dexType) {
  const rpcUrl = process.env.LOCAL_RPC_URL || 'https://bsc-dataseed.binance.org/';
  let position_manger;
  if (dexType == 'pancake') {
    position_manger = '0x46A15B0b27311cedF172AB29E4f4766fbE7F4364';
  } else if (dexType == 'uniswap') {
    position_manger = '0x7b8A01B39D58278b5DE7e48c8449c9f4F5170613';
  }
  const watcher = new PancakePositionWatcher(rpcUrl, position_manger, PoolABI);
  return watcher;
}

export async function killAnvilFork() {
  if (anvilProcess && !anvilProcess.killed && anvilProcess.pid) {
    try {
      process.kill(-anvilProcess.pid, 'SIGTERM'); // 负号表示杀掉整个进程组
      logger.info("Anvil fork killed successfully.");
    } catch (error) {
      logger.error("Failed to kill anvil fork:", error);
    }
  } else {
    // 兜底：如果没有记录进程对象，仍可用 pkill
    try {
      const { stdout, stderr } = await execAsync("pkill -f anvil || true");
      if (stdout) logger.info(stdout);
      if (stderr) logger.error(stderr);
      logger.info("Anvil fork killed by pkill.");
    } catch (error) {
      logger.error("Failed to kill anvil fork by pkill:", error);
    }
  }
}

export async function startAnvilFork() {

  const rpcUrl = process.env.RPC_URL || 'https://bsc-dataseed.binance.org/';
  anvilProcess = spawn("anvil", ["-f", rpcUrl, "-q"], {
    stdio: "inherit",
    detached: true
  });

  anvilProcess.on("error", (err) => {
    logger.error("Failed to start anvil:", err);
  });

  anvilProcess.on("exit", (code) => {
    logger.info("Anvil exited with code", code);
  });
  // wait 5 seconds for anvil to be ready
  await new Promise((resolve) => setTimeout(resolve, 5000));
  return anvilProcess;
}

const watcherUniswap = await initWatcher('uniswap');
const watcherPancake = await initWatcher('pancake');

export async function getTokenAmount(poolAddress: string, tokenId: string, dexType: string) {
  if (dexType === 'pancake') {
    return await watcherPancake.getTokenAmountWithAddress(tokenId, poolAddress);
  } else if (dexType === 'uniswap') {
    return await watcherUniswap.getTokenAmountWithAddress(tokenId, poolAddress);
  } else {
    throw new Error(`Unsupported dex type: ${dexType}`);
  }
}

// 获取 tokens owed
export async function getTokensOwed(poolAddress: string, tokenId: string, dexType) {
  if (dexType === 'pancake') {
    return await watcherPancake.getTokensOwedWithAddress(tokenId, poolAddress);
  } else if (dexType === 'uniswap') {
    return await watcherUniswap.getTokensOwedWithAddress(tokenId, poolAddress);
  } else {
    throw new Error(`Unsupported dex type: ${dexType}`);
  }
}
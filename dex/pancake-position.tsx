import dotenv from 'dotenv'
import { ethers } from 'ethers';
import NonfungiblePositionManagerABI from './abi/NonfungiblePositionManager.json' with { type: 'json' };
import { PositionMath } from '@pancakeswap/v3-sdk';
import PoolABI from './abi/PancakeV3Pool.json' with { type: 'json' };
import logger from './logger';
import { pool as db } from '../dashboard/db/pg-client';
import { Token } from '@pancakeswap/swap-sdk-core';
import { sqrtRatioX96ToPrice } from '@pancakeswap/v3-sdk';
import { withRetry } from './utils';
import { ChainId } from '@pancakeswap/sdk';

dotenv.config();
const provider = new ethers.JsonRpcProvider(process.env.WEB3_PROVIDER_URI || 'http://localhost:8545', { chainId: ChainId.BSC, name: 'BSC' }, {staticNetwork: true});

export class PancakePositionWatcher {
  static watcherInstances = new Map();
  positionManager: string;
  poolInfo: any;
  positionCache: Map<string, any>;
  positionMgrContract: ethers.Contract;
  poolContract: ethers.Contract | null;
  interval: NodeJS.Timeout | null;
  token0Decimal: number;
  token1Decimal: number;
  token0Address: string;
  token1Address: string;
  constructor(positionManager, poolAddress) {
    this.positionManager = positionManager;
    this.poolInfo = {};
    this.positionCache = new Map();
    this.positionMgrContract = new ethers.Contract(
      positionManager,
      NonfungiblePositionManagerABI,
      provider
    );
    this.poolContract = new ethers.Contract(poolAddress, PoolABI, provider);
    this.interval = null;
  }
// return watcher instances for specific pools and tokenIds
static getWatcherByPool(poolAddress) {
  const key = poolAddress.toLowerCase();
  if (PancakePositionWatcher.watcherInstances.has(key)) {
    return PancakePositionWatcher.watcherInstances.get(key);
  } else {
    throw new Error(`Watcher for pool ${poolAddress} not found`);
  }
}

async initPool() {
    if (!this.poolContract) throw new Error('Pool contract not initialized');
    const [token0, token1, token0Decimal, token1Decimal] = await Promise.all([
      this.poolContract.token0(),
      this.poolContract.token1(),
      this.getTokenDecimals(await this.poolContract.token0()),
      this.getTokenDecimals(await this.poolContract.token1())
    ]);
    this.token0Address = token0;
    this.token1Address = token1;
    this.token0Decimal = token0Decimal;
    this.token1Decimal = token1Decimal;
}

async getTokenPrice(baseTokenAddress) {
    if (!this.poolInfo) {
      logger.error('Pool info not initialized');
      return;
    }
    const currency0 = new Token(56, this.token0Address as `0x${string}`, this.token0Decimal, 'token0');
    const currency1 = new Token(56, this.token1Address as `0x${string}`, this.token1Decimal, 'token1');
    const price = sqrtRatioX96ToPrice(this.poolInfo.sqrtRatioX96, currency0, currency1);
    let priceWrapped = price.wrapped.toFixed(6);
    if (baseTokenAddress.toLowerCase() === this.token0Address.toLowerCase()) {
      logger.info(`Price of ${currency0.symbol} in ${currency1.symbol}:`, priceWrapped);
      return priceWrapped;
    } else if (baseTokenAddress.toLowerCase() === this.token1Address.toLowerCase()) {
      priceWrapped = (1 / Number(priceWrapped)).toFixed(6);
      logger.info(`Price of ${currency1.symbol} in ${currency0.symbol}:`, priceWrapped);
      return priceWrapped;
    }
  }

async getTokenAmount(tokenId) {
    let position = this.positionCache.get(tokenId);
    if (!this.poolInfo) {
      await this.getPoolInfo();
    }
    if (!position) {
      await this.getPositionInfo(tokenId);
      position = this.positionCache.get(tokenId);
      if (!position) {
        return { amount0: 0, amount1: 0 };
      }
    }
    const tickCurrent = Number(this.poolInfo.tick);
    const tickLower = Number(position.tickLower);
    const tickUpper = Number(position.tickUpper);
    const sqrtRatioX96 = BigInt(this.poolInfo.sqrtRatioX96);
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
    return { amount0: humanToken0Amount, amount1: humanToken1Amount };
}

async getTokenDecimals(tokenAddress) {
    const ERC20_ABI = [
      "function decimals() view returns (uint8)"
    ];
    const tokenContract = new ethers.Contract(tokenAddress, ERC20_ABI, provider);
    const decimals = await tokenContract.decimals();
    return Number(decimals);
}

  async getPositionInfo(tokenId: string) {
    try {
      const pos = await this.positionMgrContract.positions(tokenId);
      const info = {
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
      this.positionCache.set(tokenId, info);
      return info;
    } catch (err) {
      logger.error(`Error getting position info for tokenId ${tokenId}:`, err);
    }
  }

async getPoolInfo() {
  if (!this.poolContract) {
    throw new Error('Pool contract not initialized');
  }
  const [poolInfo] = await Promise.all([
    this.poolContract.slot0()
  ]);
  const pool = {
    sqrtRatioX96: poolInfo.sqrtPriceX96.toString(),
    tick: poolInfo.tick,
  }
  this.poolInfo = pool;
  return pool;
}

async poll() {
  try {
    const tokenIds = Array.from(this.positionCache.keys());
    await Promise.all([
      this.getPoolInfo(),
      ...tokenIds.map(async (tokenId) => {
        this.getPositionInfo(tokenId);
      })
    ]);
  } catch (err) {
    logger.error('Error in poll:', err);
  }
}

  async start(intervalMs = 3000) {
    await withRetry(() => this.initPool(), 3, 2000);
    this.interval = setInterval(() => withRetry(() => this.poll(), 3, 2000), intervalMs);
    logger.info(`PancakePositionWatcher started for ${this.positionManager} with interval ${intervalMs}ms`);
  }

  stop() {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
  }
}

export async function initWatcherByPool(dexType, poolAddress) {
  let position_manger;
  if (dexType == 'pancake') {
    position_manger = '0x46A15B0b27311cedF172AB29E4f4766fbE7F4364';
  } else if (dexType == 'uniswap') {
    position_manger = '0x7b8A01B39D58278b5DE7e48c8449c9f4F5170613';
  }
  const watcher = new PancakePositionWatcher(position_manger, poolAddress);
  const key = poolAddress.toLowerCase();  
  PancakePositionWatcher.watcherInstances.set(key, watcher);
  await watcher.start(3000);
  await watcher.poll();
  return watcher;
}

// get position from postgres database table
export async function getActivePositions(userAddress) {
  const positions: Array<{ tokenId: string; base_token_address: string; quote_token_address: string; pool_address: string; current_base_amount: string; current_quote_amount: string; pool_name: string }> = [];
  const query = `
    SELECT base_token_address, quote_token_address, position_token_id, pool_address, current_base_amount, current_quote_amount, pool_name from lp_strategy_snapshots
    WHERE is_active = true AND owner = $1
  `;
  const result = await db.query(query, [userAddress]);
  for (const row of result.rows) {
    positions.push({
      tokenId: row.position_token_id,
      base_token_address: row.base_token_address,
      quote_token_address: row.quote_token_address,
      pool_address: row.pool_address,
      current_base_amount: row.current_base_amount,
      current_quote_amount: row.current_quote_amount,
      pool_name: row.pool_name
    });
  }
  logger.info(`got ${positions.length} active positions for user ${userAddress}`);
  return positions;
}

// const TOKEN_ID_2 = 997991;
// const pool_address_2 = '0x36696169C63e42cd08ce11f5deeBbCeBae652050'; // Replace with your actual pool address
// await initWatcherByPool('pancake', pool_address_2);
// // Now you can get the watcher instance by pool address:
// const watcher2 = PancakePositionWatcher.getWatcherByPool(pool_address_2);
// watcher2.getTokenAmount(TOKEN_ID_2);
// watcher2.getTokenPrice('0x55d398326f99059fF775485246999027B3197955');


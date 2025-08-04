import dotenv from 'dotenv'
import { ethers } from 'ethers';
import NonfungiblePositionManagerABI from './abi/NonfungiblePositionManager.json' assert { type: 'json' };
import { PositionMath, PositionLibrary, TickLibrary } from '@pancakeswap/v3-sdk';
import PoolABI from './abi/PancakeV3Pool.json' assert { type: 'json' };
import e from 'express';

dotenv.config();

export class PancakePositionWatcher {
  static watcherInstances = new Map();
  constructor(rpcUrl, positionManager, tokenId, poolAddress, poolAbi) {
    this.rpcUrl = rpcUrl;
    this.positionManager = positionManager;
    this.tokenId = tokenId;
    this.poolCache = new Map(); // Cache for pool data
    this.positionCache = new Map();
    this.provider = new ethers.JsonRpcProvider(rpcUrl);
    this.contract = new ethers.Contract(
      positionManager,
      NonfungiblePositionManagerABI,
      this.provider
    );
    this.poolAddress = poolAddress;
    this.poolAbi = poolAbi;
    this.poolContract = poolAddress && poolAbi
      ? new ethers.Contract(poolAddress, poolAbi, this.provider)
      : null;
    this.interval = null;
  }
// return watcher instances for specific pools and tokenIds
static getWatcherByPool(poolAddress, tokenId) {
  const key = `${poolAddress.toLowerCase()}_${tokenId}`;
  if (PancakePositionWatcher.watcherInstances.has(key)) {
    return PancakePositionWatcher.watcherInstances.get(key);
  } else {
    throw new Error(`Watcher for pool ${poolAddress} and tokenId ${tokenId} not found`);
  }
}

async getTokenAmount() {
    // Ensure all are BigInt
    const pool = this.poolCache.get(this.poolAddress);
    const position = this.positionCache.get(this.tokenId);
    if (!pool || !position) {
      throw new Error('Pool or position data not found in cache');
    }
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

    console.log('token0Amount:', humanToken0Amount);
    console.log('token1Amount:', humanToken1Amount);
    return { amount0: humanToken0Amount, amount1: humanToken1Amount };
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

async getTokensOwed() {
    
    return { owed0: 0, owed1: 0 };
}

  async getPositionInfo() {
    const pos = await this.contract.positions(this.tokenId);
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
    this.positionCache.set(this.tokenId, info);
    return info;
  }

  // Use Promise.all to fetch on-chain data in parallel and wait for all before proceeding
  async getPoolInfo() {
    if (!this.poolContract) {
      throw new Error('Pool contract not initialized');
    }
    const pos = await this.positionCache.get(this.tokenId);
    console.log('Position Info:', pos);
    // Fetch slot0 and fee growths in parallel
    const [poolInfo] = await Promise.all([
      this.poolContract.slot0()
    ]);
    const pool = {
      sqrtRatioX96: poolInfo.sqrtPriceX96.toString(),
      tick: poolInfo.tick,
    }
    this.poolCache.set(this.poolAddress, pool);
    return pool;
  }

  async poll() {
    try {
      await Promise.all([
        this.getPositionInfo(),
        this.getPoolInfo()
      ]);
    } catch (err) {
      console.error('Error in poll:', err);
    }
  }

  start(intervalMs = 3000) {
    this.interval = setInterval(() => this.poll(), intervalMs);
  }

  stop() {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
  }
}

export async function initWatcherByPool(dexType, poolAddress, tokenId) {
  const rpcUrl = process.env.WEB3_PROVIDER_URI || 'https://bsc-dataseed.binance.org/';
  let position_manger;
  if (dexType == 'pancake') {
    position_manger = '0x46A15B0b27311cedF172AB29E4f4766fbE7F4364';
  } else if (dexType == 'uniswap') {
    position_manger = '0x7b8A01B39D58278b5DE7e48c8449c9f4F5170613';
  }
  const watcher = new PancakePositionWatcher(rpcUrl, position_manger, tokenId, poolAddress, PoolABI);
  const key = `${poolAddress.toLowerCase()}_${tokenId}`;
  PancakePositionWatcher.watcherInstances.set(key, watcher);
  watcher.start(3000);
  await watcher.getPositionInfo();
  await watcher.poll();
  return watcher;
}


// const TOKEN_ID = 296841;
// const pool_address = '0xF9878A5dD55EdC120Fde01893ea713a4f032229c';
// await initWatcherByPool('uniswap', pool_address, TOKEN_ID);
// // Now you can get the watcher instance by pool address:
// const watcher = PancakePositionWatcher.getWatcherByPool(pool_address, TOKEN_ID);
// watcher.getTokenAmount()
// watcher.getTokensOwed()

const TOKEN_ID_2 = 997991;
const pool_address_2 = '0x36696169C63e42cd08ce11f5deeBbCeBae652050'; // Replace with your actual pool address
await initWatcherByPool('pancake', pool_address_2, TOKEN_ID_2);
// Now you can get the watcher instance by pool address:
const watcher2 = PancakePositionWatcher.getWatcherByPool(pool_address_2, TOKEN_ID_2);
watcher2.getTokenAmount()
watcher2.getTokensOwed()

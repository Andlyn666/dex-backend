import dotenv from 'dotenv'
import { ethers } from 'ethers';
import NonfungiblePositionManagerABI from './abi/NonfungiblePositionManager.json' assert { type: 'json' };
import { PositionMath, PositionLibrary, TickLibrary } from '@pancakeswap/v3-sdk';
import PoolABI from './abi/PancakeV3Pool.json' assert { type: 'json' };

dotenv.config();

export class PancakePositionWatcher {
  static watcherInstances = new Map();
  constructor(rpcUrl, positionManager, tokenId, poolAddress, poolAbi) {
    this.rpcUrl = rpcUrl;
    this.positionManager = positionManager;
    this.tokenId = Number(tokenId);
    this.poolCache = new Map(); // Cache for pool data
    this.positionCache = new Map();
    this.tickCache = new Map(); // Cache for tick data
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
static getWatcherByPool(poolAddress) {
  if (PancakePositionWatcher.watcherInstances.has(poolAddress)) {
    return PancakePositionWatcher.watcherInstances.get(poolAddress);
  } else {
    throw new Error(`Watcher for pool ${poolAddress} and tokenId ${tokenId} not found`);
  }
}

async getTokenAmount(tokenId) {
    if (Number(tokenId) != Number(this.tokenId)) {
      console.log(`Token ID changed from ${this.tokenId} to ${tokenId}. Clearing cache.`);
      this.positionCache.delete(this.tokenId);
      this.tokenId = Number(tokenId);
      await this.poll();
    }
    const position = this.positionCache.get(this.tokenId);
    const pool = this.poolCache.get(this.poolAddress);
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

async getTokensOwed(tokenId) {
  if (Number(tokenId) != Number(this.tokenId)) {
    this.positionCache.delete(this.tokenId); // Clear cache for new tokenId
    this.tokenId = Number(tokenId);
    await this.poll();
  }
  const position = this.positionCache.get(this.tokenId);
  const pool = this.poolCache.get(this.poolAddress);
  const tickCurrent = pool.tick;
  const tickLowerData = this.tickCache.get(position.tickLower) || await this.getTickData(position.tickLower);
  const tickUpperData = this.tickCache.get(position.tickUpper) || await this.getTickData(position.tickUpper);
  if (!tickLowerData || !tickUpperData) {
    console.warn('Tick data not found for tickLower or tickUpper');
    return;
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

  console.log('tokensOwed0:',`${humanOwed0}`);
  console.log('tokensOwed1:', `${humanOwed1}`);
  return { owed0: humanOwed0, owed1: humanOwed1 };
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
    // Fetch slot0 and fee growths in parallel
    const [poolInfo, feeGrowthGlobal0X128, feeGrowthGlobal1X128, tickLowerData, tickUpperData] = await Promise.all([
      this.poolContract.slot0(),
      this.poolContract.feeGrowthGlobal0X128(),
      this.poolContract.feeGrowthGlobal1X128(),
      this.getTickData(Number(pos.tickLower)),
      this.getTickData(Number(pos.tickUpper))
    ]);
    const pool = {
      sqrtRatioX96: poolInfo.sqrtPriceX96.toString(),
      tick: poolInfo.tick,
      feeGrowthGlobal0X128: feeGrowthGlobal0X128,
      feeGrowthGlobal1X128: feeGrowthGlobal1X128,
    }
    this.poolCache.set(this.poolAddress, pool);
    // Optionally cache tick data here if not already done in getTickData
    this.tickCache.set(pos.tickLower, tickLowerData);
    this.tickCache.set(pos.tickUpper, tickUpperData);
    return pool;
  }
  // Fetch tick data from the pool contract's ticks mapping and cache it
  async getTickData(tick) {
    if (!this.poolContract) {
      throw new Error('Pool contract not initialized');
    }
    const tickData = await this.poolContract.ticks(tick);
    this.tickCache.set(tick, tickData);
    return tickData;
  }

async poll() {
    let retries = 3;
    while (retries > 0) {
      try {
        await Promise.all([
          this.getPositionInfo(),
          this.getPoolInfo()
        ]);
        return; // Success, exit the function
      } catch (err) {
        retries--;
        console.error(`Error in poll (retries left: ${retries}):`, err);
        if (retries === 0) {
          console.error('All retries failed. Shutting down.');
          process.exit(1);
        }
        // Wait 1 second before retrying
        await new Promise(res => setTimeout(res, 1000));
      }
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
  PancakePositionWatcher.watcherInstances.set(poolAddress, watcher);
  await watcher.getPositionInfo();
  await watcher.getPoolInfo();
  watcher.start(3000);
  await watcher.poll();

  return watcher;
}


// const TOKEN_ID = 296841;
// const pool_address = '0xF9878A5dD55EdC120Fde01893ea713a4f032229c';
// await initWatcherByPool('uniswap', pool_address, TOKEN_ID);
// // Now you can get the watcher instance by pool address:
// const watcher = PancakePositionWatcher.getWatcherByPool(pool_address);
// watcher.getTokenAmount(296841)
// watcher.getTokensOwed(296841)


// const TOKEN_ID_2 = 997991;
// const pool_address_2 = '0x36696169C63e42cd08ce11f5deeBbCeBae652050'; // Replace with your actual pool address
// await initWatcherByPool('pancake', pool_address_2, TOKEN_ID_2);
// // Now you can get the watcher instance by pool address:
// const watcher2 = PancakePositionWatcher.getWatcherByPool(pool_address_2, TOKEN_ID_2);
// watcher2.getTokenAmount(997991)
// watcher2.getTokensOwed(997991)

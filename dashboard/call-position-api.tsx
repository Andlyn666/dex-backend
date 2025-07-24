import axios from "axios";
import { withRetry } from "./utils";

const BASE_URL = process.env.POSITION_SERVICE_URL || "http://localhost:3100";

const watcherPools: { [key: string]: any } = {};

// 初始化 watcher
export async function initWatcherByPool(dexType: string, poolAddress: string, tokenId: string) {
    const res = await axios.post(`${BASE_URL}/init`, { dexType, poolAddress, tokenId });
    return res.data;
}

// 获取 token amount
export async function getTokenAmount(poolAddress: string, tokenId: string, dexType: string) {
   if (!watcherPools[poolAddress]) {
      // 如果没有初始化过该池子，则先初始化
      await initWatcherByPool(dexType, poolAddress, tokenId);
      watcherPools[poolAddress] = true; // 标记为已初始化
   }
    const res = await axios.get(`${BASE_URL}/get-amount-with-address`, {
        params: { poolAddress, tokenId }
    });
    return res.data;
}

// 获取 tokens owed
export async function getTokensOwed(poolAddress: string, tokenId: string, dexType) {
    console.log('getTokensOwed called with:', poolAddress, tokenId, dexType);
    if (!watcherPools[poolAddress]) {
      // 如果没有初始化过该池子，则先初始化
      await initWatcherByPool(dexType, poolAddress, tokenId);
      watcherPools[poolAddress] = true; // 标记为已初始化
    }
    const res = await axios.get(`${BASE_URL}/get-tokens-owed-with-address`, {
        params: { poolAddress, tokenId }
    });
    return res.data;
}

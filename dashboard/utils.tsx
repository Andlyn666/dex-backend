import logger from "./logger";
import { ethers } from "ethers";

export function getPoolNameByDexType(dexType) {
    if (dexType === "pancake") {
        return "PancakeSwap V3";
    } else if (dexType === "uniswap") {
        return "Uniswap V3";
    } else {
        throw new Error("Unsupported DEX type", dexType);
    }
}

export async function withRetry<T>(fn: () => Promise<T>, retries = 3, delayMs = 1000): Promise<T> {
    let lastError;
    for (let i = 0; i < retries; i++) {
        try {
            return await fn();
        } catch (err) {
            lastError = err;
            if (i < retries - 1) {
                logger.error(`Retry ${i + 1}/${retries} failed:`, err);
                await new Promise(res => setTimeout(res, delayMs));
            }
        }
    }
    logger.error(`All ${retries} retries failed.`);
    throw lastError;
}

export async function getBlockTimestamp( provider: any, blockNumber: number): Promise<string> {
    const block = (await withRetry(() => provider.getBlock(blockNumber)) as ethers.Block);
    if (!block) throw new Error(`Block ${blockNumber} not found`);
    return new Date(block.timestamp * 1000).toISOString();
}

// 各链常见quote token优先级列表（高优先级在前）
const QUOTE_TOKEN_PRIORITY: { [chain: string]: string[] } = {
    bsc: [
        "0x55d398326f99059fF775485246999027B3197955", // USDT
        "0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d", // USDC
        "0x1AF3F329e8BE154074D8769D1FFa4eE058B1DBc3", // DAI
        "0x8d0D000Ee44948FC98c9B98A4FA4921476f08B0d", //USD1
        "0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c", // WBNB
        "0x2170Ed0880ac9A755fd29B2688956BD959F933F8", // WETH
    ],
};

/**
 * 判断token0和token1谁是base token
 * @param token0 token0地址（小写）
 * @param token1 token1地址（小写）
 * @param chain  链名，如'bsc'、'eth'
 * @returns { base: string, quote: string }
 */
export function getBaseAndQuoteToken(token0: string, token1: string, chain: string): { base: string, quote: string } {
    const priorityList = QUOTE_TOKEN_PRIORITY[chain] || [];
    const idx0 = priorityList.indexOf(token0.toLowerCase());
    const idx1 = priorityList.indexOf(token1.toLowerCase());

    // 两个都在优先列表，谁优先级高谁是quote
    if (idx0 !== -1 && idx1 !== -1) {
        if (idx0 < idx1) {
            return { base: token1, quote: token0 };
        } else {
            return { base: token0, quote: token1 };
        }
    }
    // 只有token0在优先列表
    if (idx0 !== -1) {
        return { base: token1, quote: token0 };
    }
    // 只有token1在优先列表
    if (idx1 !== -1) {
        return { base: token0, quote: token1 };
    }
    // 都不在优先列表，默认token0为base
    return { base: token0, quote: token1 };
}

export function convertBlockTimetoDate(blockTime: string | number): string {
    if (blockTime === undefined || blockTime === null) return "";

    let date: Date;

    if (typeof blockTime === "string") {
        // 先尝试直接解析 ISO 字符串
        date = new Date(blockTime);
        if (isNaN(date.getTime())) {
            // 如果不是合法日期字符串，再尝试数字
            const digits = blockTime.match(/\d+/)?.[0];
            const ts = digits ? Number(digits) : NaN;
            if (isNaN(ts)) return "";
            date = ts > 1e12 ? new Date(ts) : new Date(ts * 1000);
        }
    } else if (typeof blockTime === "number") {
        date = blockTime > 1e12 ? new Date(blockTime) : new Date(blockTime * 1000);
    } else {
        return "";
    }

    if (isNaN(date.getTime())) return "";
    const day = String(date.getDate()).padStart(2, "0");
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const year = date.getFullYear();
    return `${day}-${month}-${year}`;
}

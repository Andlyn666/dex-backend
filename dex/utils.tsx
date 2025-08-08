import logger from './logger';

export function sqrtRatioX96ToPrice(sqrtRatioX96: string | bigint, decimals0: number, decimals1: number): number {
  const sqrt = typeof sqrtRatioX96 === "bigint" ? sqrtRatioX96 : BigInt(sqrtRatioX96);
  const ratio = Number(sqrt) / 2 ** 96;
  let price = ratio * ratio;
  price = price * 10 ** (decimals0 - decimals1);
  return price;
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
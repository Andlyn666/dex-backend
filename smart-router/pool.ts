import { Pool as V3Pool, TickList } from '@pancakeswap/v3-sdk'
import {
  Pool as IPool,
  V3Pool as IV3Pool,
} from '@pancakeswap/smart-router'
import { Currency, CurrencyAmount } from '@pancakeswap/sdk'

async function getV3Quote(
  pool: IV3Pool,
  amount: CurrencyAmount<Currency>,
  isExactIn: boolean = true,
): Promise<{ quote: CurrencyAmount<Currency>; numOfTicksCrossed: number; pool: IV3Pool } | null> {
  const { token0, token1, fee, sqrtRatioX96, liquidity, ticks, tick } = pool
  if (!ticks?.length) {
    return null
  }
  try {
    const v3Pool = new V3Pool(token0.wrapped, token1.wrapped, fee, sqrtRatioX96, liquidity, tick, ticks)
    const [quote, poolAfter] = isExactIn
      ? await v3Pool.getOutputAmount(amount.wrapped)
      : await v3Pool.getInputAmountByExactOut(amount.wrapped)

    // Not enough liquidity to perform the swap
    if (quote.quotient <= 0n) {
      return null
    }

    const { tickCurrent: tickAfter } = poolAfter
    const newPool: IV3Pool = {
      ...pool,
      tick: tickAfter,
      sqrtRatioX96: poolAfter.sqrtRatioX96,
      liquidity: poolAfter.liquidity,
    }
    const numOfTicksCrossed = TickList.countInitializedTicksCrossed(ticks, tick, tickAfter)
    return {
      quote,
      numOfTicksCrossed,
      pool: newPool,
    }
  } catch (e) {
    // console.warn('No enough liquidity to perform swap', e)
    return null
  }
}


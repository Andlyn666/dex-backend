import { Native, ChainId, CurrencyAmount, TradeType, Token } from '@pancakeswap/sdk';
import { V4Router } from '@pancakeswap/smart-router';
import { createPublicClient, http } from 'viem';
import { bsc } from 'viem/chains';

let client = null;
function getClient() {
  if (!client) {
    if (!process.env.WEB3_PROVIDER_URI) {
      throw new Error('WEB3_PROVIDER_URI is not set');
    }
    console.log('Using RPC URL:', process.env.WEB3_PROVIDER_URI);
    client = createPublicClient({
      chain: bsc,
      transport: http(process.env.WEB3_PROVIDER_URI),
      batch: {
        multicall: {
          batchSize: 256,
        },
      },
    });
  }
  return client;
}

// Custom JSON serializer to handle BigInt
const customSerializer = (key, value) => {
  if (typeof value === 'bigint') {
    return value.toString();
  }
  return value;
};

// Helper function to create token objects
function createCurrency(currency, chainId = ChainId.BSC) {
  if (currency === 'native') {
    return Native.onChain(chainId);
  } else {
    // For tokens, we need to create a proper Token instance
    return new Token(
      chainId,
      currency, // address
      18,       // decimals (default to 18, most common)
      '',       // symbol (we don't need this for routing)
      ''        // name (we don't need this for routing)
    );
  }
}

export async function fetchPools(req, res) {
  const { fromCurrency, toCurrency } = req.body;

  const inputCurrency = createCurrency(fromCurrency);
  const outputCurrency = createCurrency(toCurrency);

  let v3Pools;
  let attempt = 0;
  const maxAttempts = 3;

  while (attempt < maxAttempts) {
    try {
      v3Pools = await V4Router.getV3CandidatePools({
        clientProvider: () => getClient(),
        currencyA: inputCurrency,
        currencyB: outputCurrency,
      });
      break; // Success, exit loop
    } catch (error) {
      attempt++;
      console.error(`Attempt ${attempt} to fetch pools failed:`, error.message);
      if (attempt >= maxAttempts) {
        console.error('Failed to fetch pools after retry. Shutting down.');
        res.status(500).json({ error: error.message });
        // Give the response time to be sent before shutting down
        setTimeout(() => process.exit(1), 1000);
        return;
      }
    }
  }
    // Return the pools and timing information
        const response = {
          poolsKey: `${fromCurrency}_${toCurrency}`,
          poolCount: v3Pools.length,
        };
        
        // Store pools in memory for later use
        // Use a combination of fromCurrency and toCurrency as the key
        if (!global.poolCache) {
          global.poolCache = {};
        }
        if (v3Pools.length > 0) {
          global.poolCache[`${fromCurrency}_${toCurrency}`] = v3Pools;
        }
        
        // Use the custom serializer for BigInt values
        res.setHeader('Content-Type', 'application/json');
        res.send(JSON.stringify(response, customSerializer));
  }

  export async function getQuote(req, res) {
    try {
    // Start timing the entire operation
    const startTimeTotal = performance.now();
    
    const { amounts, fromCurrency, toCurrency, tradeType, poolsKey } = req.body;
    
    // Validate input
    if (!Array.isArray(amounts)) {
      throw new Error('Amounts must be an array');
    }
    
    const inputCurrency = createCurrency(fromCurrency);
    const outputCurrency = createCurrency(toCurrency);
    
    let tradeTypeValue;
    if (tradeType === 'EXACT_INPUT') {
      tradeTypeValue = TradeType.EXACT_INPUT;
    } else if (tradeType === 'EXACT_OUTPUT') {
      tradeTypeValue = TradeType.EXACT_OUTPUT;
    } else {
      throw new Error('Invalid trade type');
    }
    
    // Start timing the pool fetching or retrieval
    const startTimePools = performance.now();
    
    // Check if pools were provided or need to be fetched
    let pools;
    let poolFetchTime = 0;
    
    if (poolsKey && global.poolCache && global.poolCache[poolsKey]) {
      pools = global.poolCache[poolsKey];
      console.log(`Using ${pools.length} cached pools for key: ${poolsKey}`);
    } else {
      // Fetch new pools
      console.log('No cached pools, fetching new ones');
      const v3Pools = await V4Router.getV3CandidatePools({
        clientProvider: () => getClient(),
        currencyA: inputCurrency,
        currencyB: outputCurrency,
      });
      
      pools = [...v3Pools];
      
      // Cache these pools for future use
      if (!global.poolCache) {
        global.poolCache = {};
      }
      const newPoolsKey = `${fromCurrency}_${toCurrency}`;
      global.poolCache[newPoolsKey] = pools;
    }
    
    // End timing for pool fetching or retrieval
    const endTimePools = performance.now();
    poolFetchTime = endTimePools - startTimePools;
    
    // Start timing the trade calculations
    const startTimeTrades = performance.now();
    
    // Process each amount in parallel
    const tradePromises = amounts.map(async (amount) => {
      // Start timing individual trade calculation
      const startTimeIndividual = performance.now();
      
      // Create input amount
      const inputAmount = CurrencyAmount.fromRawAmount(inputCurrency, amount);
      
      // Get best trade
      const trade = await V4Router.getBestTrade(
        inputAmount, 
        outputCurrency, 
        tradeTypeValue, 
        {
          gasPriceWei: () => getClient().getGasPrice(),
          candidatePools: pools,
        }
      );
      
      // End timing individual trade calculation
      const endTimeIndividual = performance.now();
      const individualTradeTime = endTimeIndividual - startTimeIndividual;
      
      // Build result object
      const result = {};
      
      if (trade && trade.inputAmount) {
        result.amountIn = trade.inputAmount.toExact();
      }
      
      if (trade && trade.outputAmount) {
        result.amountOut = trade.outputAmount.toExact();
      }
      
      if (trade && trade.executionPrice) {
        result.executionPrice = trade.executionPrice.toSignificant(6);
      }
      
      if (trade && trade.priceImpact) {
        result.priceImpact = trade.priceImpact.toSignificant(2);
      }
      
      if (trade && trade.routes) {
        result.route = trade.routes.map(route => ({
          path: route.path.map(token => token.symbol || token.name || token.address),
          pools: route.pools.map(pool => (pool.fee !== undefined ? pool.fee : pool.address))
        }));
      }
      
      return {
        inputAmount: amount,
        calculationTimeMs: individualTradeTime.toFixed(2),
        ...result
      };
    });
    
    // Wait for all trades to be processed
    const results = await Promise.all(tradePromises);
    
    // End timing for trade calculations
    const endTimeTrades = performance.now();
    const tradeCalcTime = endTimeTrades - startTimeTrades;
    
    // End timing the entire operation
    const endTimeTotal = performance.now();
    const totalTime = endTimeTotal - startTimeTotal;
    
    console.log(`Processed ${results.length} trades in ${totalTime.toFixed(2)}ms`);
    console.log(`Pool retrieval: ${poolFetchTime.toFixed(2)}ms, Trade calculations: ${tradeCalcTime.toFixed(2)}ms`);
    
    // Add timing information to the response
    const responseWithTiming = {
      results: results,
      timing: {
        totalTimeMs: totalTime.toFixed(2),
        poolFetchTimeMs: poolFetchTime.toFixed(2),
        tradeCalculationsTimeMs: tradeCalcTime.toFixed(2)
      }
    };
    
    // Use the custom serializer for BigInt values
    res.setHeader('Content-Type', 'application/json');
    res.send(JSON.stringify(responseWithTiming, customSerializer));
  } catch (error) {
    console.error('Error in get-best-trade:', error);
    res.status(500).json({ error: error.message });
  }
}

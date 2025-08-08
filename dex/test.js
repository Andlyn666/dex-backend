import axios from 'axios';

async function testFetchPools() {
  try {
    const response = await axios.post('http://localhost:3000/fetch-pools', {
      dexType: 'pancake',
      fromCurrency: 'native', // or a token address
      toCurrency: '0x55d398326f99059fF775485246999027B3197955' // example: USDT on BSC
    });
    console.log('Response:', response.data);
  } catch (error) {
    if (error.response) {
      console.error('Error:', error.response.data);
    } else {
      console.error('Error:', error.message);
    }
  }
}

async function testGetQuote() {
  try {
    const response = await axios.post('http://localhost:3000/get-quote', {
      dexType: 'pancake',
      fromCurrency: 'native', // or a token address
      toCurrency: '0x55d398326f99059fF775485246999027B3197955', // example: USDT on BSC
      tradeType: 'EXACT_INPUT', // or 'EXACT_OUTPUT'
      amounts: ['1000000000000000000'], // 1 BNB in wei
      poolsKey: 'native_0x55d398326f99059fF775485246999027B3197955'
    });
    console.log('Response:', response.data);
  } catch (error) {
    if (error.response) {
      console.error('Error:', error.response.data);
    } else {
      console.error('Error:', error.message);
    }
  }
}

async function testMeteoraGetQuote() {
  const times = [];
  const payload = {
    dexType: 'meteora',
    isExactIn: false,
    a2b: true,
    poolAddress: 'CGPxT5d1uf9a8cKVJuZaJAU76t2EfLGbTmRbfvLLZp5j',
    swapAmounts: ['5000000', '10000'],
  };
  for (let i = 0; i < 2; i++) {
    const start = Date.now();
    try {
      const res = await axios.post('http://localhost:3000/get-quote', payload);
      // Optionally log: console.log(res.data);
    } catch (err) {
      console.error(`Meteora Run ${i + 1} failed:`, err.response ? err.response.data : err.message);
    }
    const end = Date.now();
    const duration = end - start;
    times.push(duration);
    console.log(`Meteora Run ${i + 1}: ${duration} ms`);
  }
  const avg = times.reduce((a, b) => a + b, 0) / times.length;
  console.log(`Meteora Average swapQuote time: ${avg.toFixed(2)} ms`);
}

async function testMeteoraSwap() {
  try {
    const response = await axios.post('http://localhost:3000/swap', {
      dexType: 'meteora',
      // Add other required fields for meteoraSwap here, for example:
      poolAddress: 'CGPxT5d1uf9a8cKVJuZaJAU76t2EfLGbTmRbfvLLZp5j',
      toTokenMint: 'So11111111111111111111111111111111111111112',
      fromTokenMint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
      amountIn: '100',
    });
    console.log('Meteora swap response:', response.data);
  } catch (error) {
    if (error.response) {
      console.error('Meteora swap error:', error.response.data);
    } else {
      console.error('Meteora swap error:', error.message);
    }
  }
}

// testMeteoraSwap();
// testFetchPools();

// testGetQuote();

// testMeteoraGetQuote();

// ---- Pancake Position Service Tests ----

async function testInitWatcher() {
  try {
    const response = await axios.post('http://localhost:3100/init', {
      poolAddress: '0x36696169C63e42cd08ce11f5deeBbCeBae652050',
      dexType: 'pancake',
    });
    console.log('Init watcher response:', response.data);
  } catch (error) {
    if (error.response) {
      console.error('Init watcher error:', error.response.data);
    } else {
      console.error('Init watcher error:', error.message);
    }
  }
}

async function testGetTokenAmount() {
  try {
    const response = await axios.get('http://localhost:3100/get-amount', {
      params: { poolAddress: '0x36696169C63e42cd08ce11f5deeBbCeBae652050', 
        tokenId: 997991
       } // replace with your pool address
    });
    console.log('Get token amount response:', response.data);
  } catch (error) {
    if (error.response) {
      console.error('Get token amount error:', error.response.data);
    } else {
      console.error('Get token amount error:', error.message);
    }
  }
}

async function testGetTokensOwed() {
  try {
    const response = await axios.get('http://localhost:3100/get-tokens-owed', {
      params: { poolAddress: '0x36696169C63e42cd08ce11f5deeBbCeBae652050' } // replace with your pool address
    });
    console.log('Get tokens owed response:', response.data);
  } catch (error) {
    if (error.response) {
      console.error('Get tokens owed error:', error.response.data);
    } else {
      console.error('Get tokens owed error:', error.message);
    }
  }
}


async function runPositionServiceTests() {
  await testInitWatcher();
  await testGetTokenAmount();
}

runPositionServiceTests();
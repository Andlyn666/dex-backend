import express from 'express';
import cors from 'cors';
import { fetchPools, getQuote } from './pancake.js';
import { fetchPools as fetchMeteoraPools, getQuote as getMeteoraQuote, swap as meteoraSwap, getPoolPrice as getMeteoraPrice } from './meteora-damm-v2.js';


const app = express();
const port = process.env.PORT || 3010;

app.use(express.json());
app.use(cors());



// Add a new endpoint to fetch pools
app.post('/fetch-pools', async (req, res) => {
  try {
    const {dexType} = req.body;
    if (dexType && dexType == 'pancake') {
      await fetchPools(req, res);
    } else if (dexType && dexType == 'meteora') {
      await fetchMeteoraPools(req, res);
    }
  }
  catch (error) {
    console.error('Error fetching pools:', error);
    res.status(500).json({ error: error.message });
  }
});

// Modify the get-best-trade endpoint to use cached pools
app.post('/get-quote', async (req, res) => {
    try {
    const {dexType} = req.body;
    if (dexType && dexType == 'pancake') {
      await getQuote(req, res);
    } else if (dexType && dexType == 'meteora') {
      await getMeteoraQuote(req, res);
    }
  }
  catch (error) {
    console.error('Error fetching pools:', error);
    res.status(500).json({ error: error.message });
  }
});

app.post('/swap', async (req, res) => {
  try {
    const {dexType} = req.body;
    if (dexType && dexType == 'pancake') {
      // Implement swap logic for PancakeSwap
      res.status(501).json({ error: 'Swap not implemented for PancakeSwap' });
    } else if (dexType && dexType == 'meteora') {
      await meteoraSwap(req, res);
    } else {
      res.status(400).json({ error: 'Invalid dexType' });
    }
  } catch (error) {
    console.error('Error processing swap:', error);
    res.status(500).json({ error: error.message });
  }
});

app.post('/get-price', async (req, res) => {
  try {
    const {dexType} = req.body;
    if (dexType && dexType == 'pancake') {
      // Implement swap logic for PancakeSwap
      res.status(501).json({ error: 'Swap not implemented for PancakeSwap' });
    } else if (dexType && dexType == 'meteora') {
      await getMeteoraPrice(req, res);
    } else {
      res.status(400).json({ error: 'Invalid dexType' });
    }
  } catch (error) {
    console.error('Error processing Meteora swap:', error);
    res.status(500).json({ error: error.message });
  }
});

// Add a health check endpoint after the other endpoints
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.listen(port, () => {
  console.log(`Router service listening at http://localhost:${port}`);
});
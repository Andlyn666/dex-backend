import express from 'express';
import cors from 'cors';
import { initWatcherByPool, PancakePositionWatcher } from './pancake-position.js';

const app = express();
const port = process.env.POSITION_PORT || 3100;

app.use(express.json());
app.use(cors());

// Initialize watcher for a pool and tokenId
app.post('/init', async (req, res) => {
  try {
    const { dexType, poolAddress, tokenId } = req.body;
    if (!poolAddress || !tokenId) {
      return res.status(400).json({ error: 'poolAddress and tokenId are required' });
    }
    const result = await initWatcherByPool(dexType, poolAddress, tokenId);
    if (result) {
      res.json({ success: true });
    } else {
      res.status(500).json({ error: 'Failed to initialize watcher' });
    }
  } catch (error) {
    console.error('Error initializing watcher:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get token amounts for a given pool
app.get('/get-amount', async (req, res) => {
  try {
    const { poolAddress, tokenId } = req.query;
    if (!poolAddress) {
      return res.status(400).json({ error: 'poolAddress is required' });
    }
    const watcher = PancakePositionWatcher.getWatcherByPool(poolAddress);
    const result = await watcher.getTokenAmount(tokenId);
    res.json(result);
  } catch (error) {
    console.error('Error getting token amount:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get token amounts for a given pool
app.get('/get-amount-with-address', async (req, res) => {
  try {
    const { poolAddress, tokenId } = req.query;
    if (!poolAddress) {
      return res.status(400).json({ error: 'poolAddress is required' });
    }
    const watcher = PancakePositionWatcher.getWatcherByPool(poolAddress);
    const result = await watcher.getTokenAmountWithAddress(tokenId);
    res.json(result);
  } catch (error) {
    console.error('Error getting token amount with address:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get token amounts for a given pool
app.get('/get-amount', async (req, res) => {
  try {
    const { poolAddress, tokenId } = req.query;
    if (!poolAddress) {
      return res.status(400).json({ error: 'poolAddress is required' });
    }
    const watcher = PancakePositionWatcher.getWatcherByPool(poolAddress);
    const result = await watcher.getTokenAmount(tokenId);
    res.json(result);
  } catch (error) {
    console.error('Error getting token amount:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get tokens owed for a given pool
app.get('/get-tokens-owed', async (req, res) => {
  try {
    const { poolAddress, tokenId} = req.query;
    if (!poolAddress) {
      return res.status(400).json({ error: 'poolAddress is required' });
    }
    const watcher = PancakePositionWatcher.getWatcherByPool(poolAddress);
    const result = await watcher.getTokensOwed(tokenId);
    res.json(result);
  } catch (error) {
    console.error('Error getting tokens owed:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get tokens owed for a given pool
app.get('/get-tokens-owed-with-address', async (req, res) => {
  try {
    const { poolAddress, tokenId} = req.query;
    if (!poolAddress) {
      return res.status(400).json({ error: 'poolAddress is required' });
    }
    const watcher = PancakePositionWatcher.getWatcherByPool(poolAddress);
    const result = await watcher.getTokensOwedWithAddress(tokenId);
    res.json(result);
  } catch (error) {
    console.error('Error getting tokens owed:', error);
    res.status(500).json({ error: error.message });
  }
});



app.get('/get-all-watcher-info', async (req, res) => {
  try {
    const watchers = await PancakePositionWatcher.getAllWatcherInfo();
    res.json(watchers);
  } catch (error) {
    console.error('Error getting all watchers:', error);
    res.status(500).json({ error: error.message });
  }
});



// Health check
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.listen(port, () => {
  console.log(`Position service listening at http://localhost:${port}`);
});
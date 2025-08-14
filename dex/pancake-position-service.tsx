import express from 'express';
import cors from 'cors';
import { initWatcherByPool, PancakePositionWatcher, getActivePositions } from './pancake-position.tsx';

const app = express();
const port = process.env.POSITION_PORT || 3100;

app.use(express.json());
app.use(cors());

// Initialize watcher for a pool and tokenId
app.post('/init', async (req, res) => {
  try {
    const { dexType, poolAddress } = req.body;
    if (!poolAddress) {
      return res.status(400).json({ error: 'poolAddress is required' });
    }
    const result = await initWatcherByPool(dexType, poolAddress);
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
    const { poolAddress, tokenId, baseAddress, quoteAddress } = req.query;
    if (!poolAddress) {
      return res.status(400).json({ error: 'poolAddress is required' });
    }
    const watcher = PancakePositionWatcher.getWatcherByPool(poolAddress);
    const result = await watcher.getTokenAmount(tokenId, baseAddress, quoteAddress);
    res.json(result);
  } catch (error) {
    console.error('Error getting token amount:', error);
    res.status(500).json({ error: error.message });
  }
});

app.get('/get-active-positions', async (req, res) => {
  try {
    const { userAddress } = req.query;
  if (!userAddress) {
      return res.status(400).json({ error: 'userAddress is required' });
    }
    const positions = await getActivePositions(userAddress);
    if (positions.length === 0) {
      return res.status(404).json({ error: 'No active positions found for this user' });
    }
    res.json(positions);
  } catch (error) {
    console.error('Error getting active positions:', error);
    res.status(500).json({ error: error.message });
  }
});

app.get('/get-token-price', async (req, res) => {
  try {
    const { poolAddress, baseTokenAddress } = req.query;
    if (!poolAddress || !baseTokenAddress) {
      return res.status(400).json({ error: 'poolAddress and baseTokenAddress are required' });
    }
    const watcher = PancakePositionWatcher.getWatcherByPool(poolAddress);
    if (!watcher) {
      return res.status(404).json({ error: 'Watcher not found for this pool' });
    }
    const price = await watcher.getTokenPrice(baseTokenAddress);
    if (!price) {
      return res.status(404).json({ error: 'Price not found for this token' });
    }
    res.json({ price });
  } catch (error) {
    console.error('Error getting token price:', error);
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
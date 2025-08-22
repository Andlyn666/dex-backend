import express from 'express';
import cors from 'cors';
import { PancakePositionWatcher, getActivePositions, stopAllWatchers } from './pancake-position.tsx';

const app = express();
const port = process.env.POSITION_PORT || 3100;

app.use(express.json());
app.use(cors());

// Get token amounts for a given pool
app.get('/get-amount', async (req, res) => {
  try {
    const { poolAddress, tokenId, baseAddress, quoteAddress, dexType } = req.query;
    if (!poolAddress || !dexType) {
      return res.status(400).json({ error: 'poolAddress and dexType are required' });
    }
    const watcher = await PancakePositionWatcher.getWatcherByPool(poolAddress, dexType);
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
    const { poolAddress, baseTokenAddress, dexType } = req.query;
    if (!poolAddress || !baseTokenAddress || !dexType) {
      return res.status(400).json({ error: 'poolAddress, baseTokenAddress, and dexType are required' });
    }
    const watcher = await PancakePositionWatcher.getWatcherByPool(poolAddress, dexType);
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

setInterval(() => {
  console.log('Auto call stopAllWatchers (every 48h)');
  stopAllWatchers();
}, 48 * 60 * 60 * 1000);

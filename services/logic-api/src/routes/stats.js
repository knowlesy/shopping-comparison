import express from 'express';
import { PriceHistory } from '../services/priceHistory.js';

export const statsRouter = express.Router();

statsRouter.get('/', (_req, res) => {
  try {
    const stats = PriceHistory.getStats();
    res.json(stats);
  } catch (err) {
    res.status(500).json({ error: 'Failed to retrieve stats', details: err.message });
  }
});

statsRouter.get('/item/:itemKey', (req, res) => {
  try {
    const { itemKey } = req.params;
    const series = PriceHistory.getItemSeries(itemKey);
    res.json(series);
  } catch (err) {
    res.status(500).json({ error: 'Failed to retrieve item price series', details: err.message });
  }
});

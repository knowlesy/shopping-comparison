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

import express from 'express';
import { PriceCache } from '../services/priceCache.js';

export const cacheRouter = express.Router();

cacheRouter.get('/stats', (req, res) => {
  res.json(PriceCache.getStats());
});

cacheRouter.post('/clear', (req, res) => {
  const result = PriceCache.clear();
  res.json(result);
});

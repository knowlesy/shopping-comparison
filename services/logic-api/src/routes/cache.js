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

// 72-hour Recent Searches & Pinning
cacheRouter.get('/recent-searches', (req, res) => {
  res.json(PriceCache.loadRecentSearches());
});

cacheRouter.post('/record-search', (req, res) => {
  const { query, rawList, itemsCount } = req.body || {};
  const updated = PriceCache.recordSearch({ query, rawList, itemsCount });
  res.json(updated || []);
});

cacheRouter.post('/pin-search', (req, res) => {
  const { id } = req.body || {};
  if (!id) return res.status(400).json({ error: 'Search ID is required' });
  const updated = PriceCache.togglePinSearch(id);
  res.json(updated);
});

cacheRouter.delete('/recent-searches/:id', (req, res) => {
  const { id } = req.params;
  const updated = PriceCache.deleteSearch(id);
  res.json(updated);
});

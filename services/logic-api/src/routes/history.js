import express from 'express';
import { PriceCache } from '../services/priceCache.js';

export const historyRouter = express.Router();

let shopHistory = PriceCache.loadShopHistory();

historyRouter.get('/', (req, res) => {
  res.json(shopHistory);
});

historyRouter.post('/', (req, res) => {
  const newShop = {
    ...req.body,
    id: `shop-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
    createdAt: new Date().toISOString()
  };
  shopHistory.unshift(newShop);
  PriceCache.saveShopHistory(shopHistory);
  res.json(newShop);
});

historyRouter.delete('/:id', (req, res) => {
  shopHistory = shopHistory.filter((s) => s.id !== req.params.id);
  PriceCache.saveShopHistory(shopHistory);
  res.json({ success: true });
});

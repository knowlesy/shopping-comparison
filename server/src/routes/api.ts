import { Router, Request, Response } from 'express';
import { ShoppingListParser } from '../services/parser.js';
import { SupermarketComparisonService } from '../services/supermarketService.js';
import { DatabaseService } from '../services/db.js';
import { SupermarketName, ParsedItem, UserPreferences } from '../types.js';

const router = Router();

// Parse raw text shopping list
router.post('/parse-list', (req: Request, res: Response) => {
  try {
    const { rawText } = req.body;
    if (!rawText || typeof rawText !== 'string') {
      return res.status(400).json({ error: 'rawText string is required' });
    }
    const items = ShoppingListParser.parse(rawText);
    res.json({ items });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Compare list across supermarkets
router.post('/compare', (req: Request, res: Response) => {
  try {
    const { items, preferences } = req.body;
    if (!Array.isArray(items)) {
      return res.status(400).json({ error: 'items array is required' });
    }
    const userPrefs = preferences || DatabaseService.getPreferences();
    const comparison = SupermarketComparisonService.compare(items, userPrefs);
    res.json(comparison);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Fetch product alternatives for manual swapping
router.get('/products/alternatives', (req: Request, res: Response) => {
  try {
    const store = req.query.store as SupermarketName;
    const query = req.query.query as string;
    if (!store || !query) {
      return res.status(400).json({ error: 'store and query parameters are required' });
    }
    const alternatives = SupermarketComparisonService.getAlternatives(store, query);
    res.json({ alternatives });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// User Preferences / Settings
router.get('/settings', (_req: Request, res: Response) => {
  res.json(DatabaseService.getPreferences());
});

router.put('/settings', (req: Request, res: Response) => {
  try {
    const updated = DatabaseService.updatePreferences(req.body);
    res.json(updated);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// History / Archives
router.get('/history', (_req: Request, res: Response) => {
  res.json(DatabaseService.getHistory());
});

router.post('/history', (req: Request, res: Response) => {
  try {
    const shop = DatabaseService.addHistoryShop(req.body);
    res.json(shop);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/history/:id', (req: Request, res: Response) => {
  const success = DatabaseService.deleteHistoryShop(req.params.id);
  res.json({ success });
});

// Store Favorites
router.get('/favorites', (_req: Request, res: Response) => {
  res.json(DatabaseService.getFavorites());
});

router.post('/favorites', (req: Request, res: Response) => {
  try {
    const fav = DatabaseService.addFavorite(req.body);
    res.json(fav);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/favorites/:id', (req: Request, res: Response) => {
  const success = DatabaseService.removeFavorite(req.params.id);
  res.json({ success });
});

// Word Window / Ingredient Ideas
router.get('/ingredient-ideas', (_req: Request, res: Response) => {
  res.json(DatabaseService.getIngredientIdeas());
});

router.post('/ingredient-ideas', (req: Request, res: Response) => {
  try {
    const idea = DatabaseService.addIngredientIdea(req.body);
    res.json(idea);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/ingredient-ideas/:id', (req: Request, res: Response) => {
  const success = DatabaseService.removeIngredientIdea(req.params.id);
  res.json({ success });
});

export default router;

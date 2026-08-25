import express from 'express';
import { IngredientParser } from '../services/ingredientParser.js';

export const parseRouter = express.Router();

parseRouter.post('/', (req, res) => {
  const { rawText = '' } = req.body;
  if (!rawText || typeof rawText !== 'string') {
    return res.status(400).json({ error: 'No rawText provided in request body' });
  }

  const items = IngredientParser.parseList(rawText);
  res.json({ items });
});

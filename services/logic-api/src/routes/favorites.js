import express from 'express';

export const favoritesRouter = express.Router();

let userFavorites = [];

favoritesRouter.get('/', (req, res) => {
  res.json(userFavorites);
});

favoritesRouter.post('/', (req, res) => {
  const newFav = {
    ...req.body,
    id: `fav-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
    createdAt: new Date().toISOString()
  };
  userFavorites.push(newFav);
  res.json(newFav);
});

favoritesRouter.delete('/:id', (req, res) => {
  userFavorites = userFavorites.filter((f) => f.id !== req.params.id);
  res.json({ success: true });
});

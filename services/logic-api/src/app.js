import express from 'express';
import cors from 'cors';

import { parseRouter } from './routes/parse.js';
import { compareRouter } from './routes/compare.js';
import { alternativesRouter } from './routes/alternatives.js';
import { settingsRouter } from './routes/settings.js';
import { historyRouter } from './routes/history.js';
import { favoritesRouter } from './routes/favorites.js';
import { ideasRouter } from './routes/ideas.js';
import { cacheRouter } from './routes/cache.js';
import { authRouter } from './routes/auth.js';
import { systemRouter } from './routes/system.js';
import { statsRouter } from './routes/stats.js';

/**
 * Build the Logic-API express application.
 *
 * Separated from process bootstrap (index.js) so integration tests can start the
 * real application — same middleware, same routers, same order — on their own
 * port without importing listen/bootstrap side effects.
 *
 * @returns {import('express').Express}
 */
export function createApp() {
  const app = express();
  const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN || 'http://localhost:5173';

  // OWASP Security: Conceal express engine footprint
  app.disable('x-powered-by');

  // OWASP Security: Standard defensive response headers
  app.use((_req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'SAMEORIGIN');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=()');
    res.setHeader('X-Permitted-Cross-Domain-Policies', 'none');
    next();
  });

  app.use(
    cors({
      origin: CLIENT_ORIGIN,
      credentials: true
    })
  );
  app.use(express.json({ limit: '5mb' }));
  app.use(express.urlencoded({ extended: true, limit: '5mb' }));

  // Health check endpoint
  app.get('/health', (_req, res) => {
    res.json({
      status: 'ok',
      service: 'logic-api',
      uptime: process.uptime(),
      timestamp: new Date().toISOString()
    });
  });

  // Modular route handlers
  app.use('/api/parse-list', parseRouter);
  app.use('/api/compare', compareRouter);
  app.use('/api/products/alternatives', alternativesRouter);
  app.use('/api/alternatives', alternativesRouter);
  app.use('/api/settings', settingsRouter);
  app.use('/api/history', historyRouter);
  app.use('/api/favorites', favoritesRouter);
  app.use('/api/ingredient-ideas', ideasRouter);
  app.use('/api/cache', cacheRouter);
  app.use('/api/auth', authRouter);
  app.use('/api/system', systemRouter);
  app.use('/api/stats', statsRouter);

  return app;
}

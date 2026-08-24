import express from 'express';
import cors from 'cors';
import path from 'path';
import apiRouter from './routes/api.js';
import { DatabaseService } from './services/db.js';

const app = express();
const PORT = process.env.PORT || 3001;

// Initialize Database
DatabaseService.init();

// Middlewares
app.use(cors());
app.use(express.json({ limit: '10mb' }));

// API Routes
app.use('/api', apiRouter);

// Serve static frontend assets if built
const clientDistPath = path.resolve(process.cwd(), '../client/dist');
app.use(express.static(clientDistPath));

app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api')) {
    return next();
  }
  const indexPath = path.join(clientDistPath, 'index.html');
  res.sendFile(indexPath, err => {
    if (err) {
      res.status(200).send(`
        <html>
          <head><title>TrolleyWise API</title></head>
          <body style="font-family: sans-serif; padding: 40px; text-align: center;">
            <h2>🛒 TrolleyWise API Server is running on port ${PORT}</h2>
            <p>Start the frontend client dev server with <code>npm run dev:client</code> or run <code>npm run dev</code> from root.</p>
          </body>
        </html>
      `);
    }
  });
});

app.listen(PORT, () => {
  console.log(`🚀 TrolleyWise UK Supermarket Server running on http://localhost:${PORT}`);
});

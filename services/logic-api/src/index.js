import dotenv from 'dotenv';

import { createApp } from './app.js';

dotenv.config();

const app = createApp();
const PORT = process.env.PORT || 3001;

app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 [Logic-API] Service B listening on http://0.0.0.0:${PORT}`);
  console.log(
    `   Scraper Endpoint Target: ${process.env.SCRAPER_SERVICE_URL || 'http://127.0.0.1:3002/scrape'}`
  );
});

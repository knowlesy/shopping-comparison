# TrolleyWise UK 🛒

A clean, modern, high-performance grocery price comparison application for UK supermarket shoppers. Compare real product prices, packaging sizes, and healthier alternatives across 7 major UK supermarkets: **Asda**, **Tesco**, **Sainsbury's**, **Morrisons**, **Iceland**, **Aldi**, and **Lidl**.

---

## ✨ Key Features

- **Multi-Supermarket Comparison**: Live side-by-side price, unit-price (£/kg, £/L), and package sizing matrix across all 7 UK stores.
- **Smart NLP Item Parser**: Extracts metric quantities ($g$, $kg$, $ml$, $L$, packs, heads, bunches, cans), compound formats ($3 \times 400g$), and dietary health preferences ($5\%$ lean, $0\%$ Greek yogurt, wholewheat, free range, organic).
- **Closest-Pack Sizing Engine**: Recommends optimal packaging configurations, pack counts, and closest unit weights.
- **Food Form & Contamination Filter**: Zero false matches (e.g. rejects Scotch eggs/mayo for fresh eggs, crisps for potatoes, milkshakes for milk, dessert drinks for Greek yogurt).
- **Interactive "Swap Item" Picker**: Change brands, pack sizes, or fat percentages with real-time basket recalculation.
- **Split-Basket Optimizer**: Identifies maximum combined savings when splitting shopping across 2 supermarkets.
- **Offline Client Fallback**: Client-side parsing and catalog engine allows full functionality when offline.

---

## 🚀 Quick Start (Docker Compose — Recommended)

The canonical backend stack consists of two isolated microservices:
1. **`logic-api`**: Core comparison, NLP parsing, and basket optimization service (`http://localhost:3001`).
2. **`scraper-pod`**: Sandboxed Chromium scraping engine (`http://scraper-pod:3002`).

### 1. Configure Environment
Copy `.env.example` to `.env` and set your `SCRAPE_TOKEN`:
```bash
cp .env.example .env
# Set a secure random token in .env, e.g.:
# SCRAPE_TOKEN=$(openssl rand -hex 24)
```

### 2. Launch Services via Docker Compose
```bash
docker compose up --build -d
```

### 3. Start the Frontend Client
```bash
npm --prefix client install
npm --prefix client run dev
```
Open **`http://localhost:5173`** in your browser.

---

## 💻 Local Development (Without Docker)

Both microservices automatically load environment variables from `.env` via `dotenv`.

```bash
# 1. Configure environment
cp .env.example .env

# 2. Install root, client, and microservice dependencies
npm install
npm --prefix client install
npm --prefix services/logic-api install
npm --prefix services/scraper-pod install

# 3. Start all 3 services concurrently
npm run dev
```

---

## 🧪 Running Tests & Audits

```bash
# Pure unit tests
npm test

# Comprehensive food form sanity and catalog variety audit
npm run test:food-form

# 20 full uncached tests across 30-item lists
npm run test:uncached-20
```

---

## 📁 Repository Structure

```
├── client/              # React + Vite + TypeScript frontend
├── data/                # Canonical product catalog (data/catalog.json)
├── services/
│   ├── logic-api/       # Business logic, fuzzy matcher, basket calculator
│   └── scraper-pod/     # Headless Chromium scraper daemon
├── tests/               # Playwright e2e specs and audit datasets
└── docker-compose.yml   # Multi-container orchestration
```

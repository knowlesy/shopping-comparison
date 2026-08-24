# TrolleyWise UK 🛒

A clean, modern, high-performance web application designed for UK supermarket shoppers to compare real product prices, packaging sizes, and healthier alternatives across **Asda**, **Sainsbury's**, **Tesco**, **Morrisons**, and **Iceland**.

---

## ✨ Features

- **Split-Screen Comparison View**: Live shopping checklist on the left, side-by-side UK supermarket price matrix on the right.
- **Smart NLP Item Parser**: Intelligently extracts quantities, units ($g$, $kg$, $ml$, $L$, packs, heads, bunches, cans), compound quantities ($3\times 400g$), and dietary health preferences ($5\%$ lean, $0\%$ Greek yogurt, wholewheat, free range, organic).
- **Closest-Pack Sizing Engine**: Recommends the optimal packaging configuration (e.g. $900g$ mince $\rightarrow$ closest $750g$ single pack or $2\times 500g$ pack), displaying exact pack counts, total weights, and unit prices (£/kg, £/L).
- **No Faking / Working Direct Links**: Every single product links directly to its official supermarket product or search page.
- **Interactive "Swap Item" Picker**: Click any matched item to view and select alternative sizes, brands, or fat percentages with real-time total recalculation.
- **Split Basket Optimizer**: Calculates the maximum possible savings if ordering across 2 supermarkets (e.g. frozen/seafood from Iceland + fresh produce/meat from Asda).
- **Favorite Ingredients "Word Window / Idea Cloud"**: Interactive tag cloud of pantry staples, high-protein foods, and cleaning supplies for rapid 1-tap list addition.
- **Past Shops & Price Inflation Archive**: Store previous shopping baskets with historical supermarket pricing and 1-click list reloading.
- **Preferences & Settings**: Customize default health biasing, brand tiers (Value vs Standard vs Premium vs Branded), packaging rounding policies, and supermarket inclusions.

---

## 🚀 Quick Start

### 1. Install Dependencies
```bash
npm install
cd server && npm install
cd ../client && npm install
```

### 2. Run in Development Mode
Runs both the Vite React frontend (`http://localhost:5173`) and Express backend (`http://localhost:3001`):
```bash
npm run dev
```

### 3. Build & Run in Production Mode
```bash
npm run build
npm start
```
Open `http://localhost:3001` in your browser.

---

## 📋 Example 28-Item Shopping List Included
The application is pre-seeded with the complete 28-item grocery list:
- `900g 5% lean beef mince`
- `1.6kg frozen cod loins`
- `15 free range eggs`
- `1kg authentic Greek yogurt 0%`
- `800g tinned brown lentils`
- `1.13L semi-skimmed milk`
- `1kg wholewheat fusilli`
- `2kg baby new potatoes`
- `1kg Scottish rolled oats`
- `800g wholemeal sliced bread`
- `3 x 400g Mutti Polpa chopped tomatoes`
- `200g tomato puree`
- `500ml extra virgin olive oil`
- `1kg courgettes`
- `1kg mixed bell peppers`
- `400g closed cup mushrooms`
- `600g baby plum tomatoes`
- `1kg carrots`
- `1 head celery`
- `1kg brown onions`
- `1kg red onions`
- `1 pack garlic bulbs`
- `240g fresh baby spinach`
- `1 bunch bananas`
- `800g conference pears`
- `600g clementines`
- `200g walnut halves and whole almonds`
- `150g chia seeds`

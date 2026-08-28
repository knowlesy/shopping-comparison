# User Journey & Interactive Workflow 🛒

This document illustrates the end-to-end user experience and state transitions in the application—from submitting an ingredient list to exploring multi-supermarket prices, swapping items, and optimizing basket costs.

---

## 1. End-to-End User Interaction Flow

```mermaid
flowchart TD
    Start([User Opens App]) --> ModeSelect{Choose Search Mode}

    %% Multi-Item Shopping List Mode
    ModeSelect -->|Multi-Item Shop| EnterList[Type or Paste Grocery List in Textbox]
    EnterList --> ParseNLP[Smart NLP Parser extracts items, weights, multi-packs & dietary tags]
    ParseNLP --> ClickCompare[Click 'Compare Prices']
    ClickCompare --> SSEStream[Live Streaming Comparison via SSE]
    SSEStream --> RenderMatrix[View Multi-Supermarket Price & Sizing Matrix]

    %% Matrix Interactions
    RenderMatrix --> Actions{User Action}
    Actions -->|Click 'Swap Item'| OpenSwap[Open Swap Item Modal]
    OpenSwap --> ChooseAlt[Pick Alternative Brand, Sizing, or Healthier Cut]
    ChooseAlt --> RecalcBasket[Instant Live Basket Recalculation]
    RecalcBasket --> RenderMatrix

    Actions -->|View Split Basket| ViewSplit[Inspect Two-Store Split Basket Savings]
    Actions -->|Save Shop| SavePast[Save Trip to Archive History]
    Actions -->|View Price Trends| ViewStats[Open Stats Page for Historical Price Series]
    Actions -->|Adjust Biases| OpenSettings[Open Settings Modal]

    %% Quick Price Check Mode
    ModeSelect -->|Quick Price Check| SingleSearch[Type Single Item in Quick Check Tab]
    SingleSearch --> InstantCompare[Instant 7-Store Unit Price Comparison]
    InstantCompare --> SingleResult[View Lowest £/kg and £/L without affecting Main Shop]

    %% Settings Interactions
    OpenSettings --> SettingsTune[Tune Brand Tiers, Health Biases, Cut Policies, or Gemini AI]
    SettingsTune --> SaveSettings[Save Preferences & Invalidate Stale Cache]
    SaveSettings --> RenderMatrix
```

---

## 2. Interactive Feature Walkthrough

### 2.1 Natural Language Grocery List Input
- Users enter unstructured lists (e.g. `900g 5% lean beef mince`, `3 x 400g chopped tomatoes`, `6 large free range eggs`, `semi skimmed milk 2 pints`).
- The parser extracts unit quantities, container multipliers, and dietary requirements.

### 2.2 Multi-Supermarket Price Matrix
- Displays side-by-side product matches across 7 UK supermarkets: **Asda**, **Tesco**, **Sainsbury's**, **Morrisons**, **Iceland**, **Aldi**, and **Lidl**.
- Includes true normalized unit prices (`£/kg`, `£/L`), package configurations, and active promotions (e.g. Clubcard, Nectar, Multibuy, BOGOF).

### 2.3 Interactive "Swap Item" Modal
- Allows users to replace any matched product with alternative pack sizes, brand tiers, or dietary equivalents.
- Immediate client-side re-indexing updates the overall basket totals and store rankings instantly.

### 2.4 Split-Basket Optimization
- Identifies the optimal two-supermarket split to achieve maximum savings when dividing shopping items across two nearby stores.

### 2.5 Quick Price Check & Historical Stats
- **Quick Check Tab**: Perform standalone product lookups across supermarkets without overwriting the active weekly shopping list.
- **Stats & Trends Tab**: Track win frequencies, match provenance breakdown, and per-item historical price trends over time.

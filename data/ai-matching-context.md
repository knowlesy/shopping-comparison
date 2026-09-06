# AI Matching & Intent Extraction Context

## Overview
TrolleyWise UK utilizes a high-performance, deterministic rule-based parsing and fuzzy matching engine (`IngredientParser`, `KeywordExtractor`, `PackSelector`, `PenaltyRules`) capable of processing complex grocery lists offline with 0ms latency.

For ambiguous, natural-language, or conversational multi-item shopping entries, an optional external LLM intent extractor (e.g. Gemini 1.5 Flash / 2.0) can assist in intent classification.

## Ambiguity Heuristics & Deterministic Handling
The deterministic parser handles edge cases through explicit grammar rules:
1. **Name-First Sizing**: `Walnuts 200 g`, `Beef mince 5% 1.9 kg`, `Potatoes 1.8kg`
2. **Mid-Line Multipliers**: `Butter beans in water 2 x 400 g`
3. **Bare Numeric Counts**: `Large eggs 17`, `Bananas 10`
4. **Parenthetical Explanations & Notes**: `Garlic (fresh whole heads, not paste)` -> clean query: `garlic`, note: `fresh whole heads, not paste`
5. **Multi-Item Line Expansion**: `Fresh coriander, mint and parsley` -> expands to 3 discrete line items
6. **Compound Word Category Protection**: `Butter beans` and `Peanut butter` classified into `pantry`, not `dairy-eggs`

## Intent Helper Schema
When delegating ambiguous items to an external AI helper, the prompt requests structured JSON output conforming to:
```json
{
  "name": "String",
  "baseItem": "String",
  "targetQuantity": 1.0,
  "unit": "kg|g|l|ml|item|pack",
  "category": "produce|meat|fish|dairy-eggs|pantry|bakery|general",
  "brandPreference": "String or null",
  "fatPercentage": 5,
  "isOrganic": false,
  "isFreeRange": true,
  "notes": "String or null"
}
```

## Product Selection & Candidate Review Guidance

When evaluating supermarket candidate products for a shopping list item, the AI decision reviewer must apply the following core principles:

### 1. Cost versus Exact Size Match
- **Cost Beats Exact Size**: When no specific brand is requested by the shopper, a larger pack (or multiple smaller packs) that covers the target quantity at a lower total cost beats an exact size match or exact weight match.
- This is fundamentally a price comparison application: never pick an expensive premium brand solely because its package matches the requested number exactly. A standard or store-brand pack that satisfies or slightly overshoots the requested target quantity at a cheaper price is the superior match.
- Prioritize best value and lower total cost whenever the item's dietary, category, and minimum quantity requirements are met.

### 2. When to Decline (and When NOT to Decline)
- **When Declining is Right**:
  - Return `selectedIndex: null` (decline / none of these / no match) **only** when nothing on the candidate shelf genuinely satisfies the shopper's core requirement.
  - Decline when nothing genuinely satisfies the request — for example, when there is no wholemeal loaf on the shelf and only white bread is available, or when there are no plain sultanas among scones, biscuits, and cereals.
  - Decline when explicit dietary constraints (e.g. 0% fat yogurt, gluten-free, vegan) cannot be met by any candidate, or when all candidates represent cross-category contamination.
- **When Declining is WRONG**:
  - Do **NOT** decline merely because no candidate pack matches the requested size exactly.
  - Do **NOT** decline because buying the product involves a modest pack overage (e.g. buying a 6-pack or loose fruit for a small weight target, or a standard 654ml bottle for a 433ml request).
  - Buy the closest sufficient product and let downstream pack maths and unit conversion calculate the required pack count and total cost.

## Fail-Closed Resilience
External AI calls must always be wrapped in a bounded timeout (max 3500ms) and fail-closed: if the AI service fails, returns malformed JSON, or is rate-limited, the system seamlessly falls back to the deterministic `IngredientParser`.


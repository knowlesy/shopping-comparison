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

## Fail-Closed Resilience
External AI calls must always be wrapped in a bounded timeout (max 3500ms) and fail-closed: if the AI service fails, returns malformed JSON, or is rate-limited, the system seamlessly falls back to the deterministic `IngredientParser`.

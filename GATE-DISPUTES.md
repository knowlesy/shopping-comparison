# Gate & Fixture Disputes Log

This document records disputes between test harness labels and deepened live/recorded corpora, as mandated by repository operating procedures.

---

## Step 22: Candidate Deepening vs Existing Ground Truth Labels

In Step 22, candidate lists in `tests/fixtures/ai-matching-fixtures.real.json` were deepened from a median of 6 to a median of 24 candidates using the untrimmed Tesco search payloads from the real 52-line weekly shop scrape (`tests/fixtures/reality-fixtures.json`).

Per Step 22 instructions ("Do not change any existing label... Deepening a candidate list may introduce a product that changes the right answer — if so, stop and write it in GATE-DISPUTES.md for the owner to relabel"), the existing labels were strictly preserved and the following disputes are recorded for owner relabeling:

### 1. `real-44` — "Wholemeal bread 1 loaf"
- **Current Label:** `expectNoMatch: true` (ground truth note: *"No wholemeal bread in the candidate list. A white loaf is a dietary failure; honest no-match is the correct answer."*)
- **Deepened Candidate List Reality:** The untrimmed Tesco search returns 26 products, which include genuine wholemeal bread products:
  - `299425783`: `Tesco Wholemeal Medium Sliced Bread 800g` (£1.45)
  - `254944260`: `Warburtons Wholemeal Medium Sliced Bread 800g` (£1.40)
  - `255000362`: `Hovis Wholemeal Tasty Medium Bread 800g` (£1.45)
- **Dispute:** The original label tested honest decline when no wholemeal bread was on the shelf. With the full shelf restored, wholemeal bread IS available. Evaluating this fixture against `expectNoMatch: true` causes rules and AI to fail when they correctly identify a genuine wholemeal loaf.
- **Action Required:** Owner to relabel `expectedPick: "299425783"` or determine whether to isolate no-shelf fixtures in a separate test split.

### 2. `real-37` — "Greek yogurt 0% 1 kg"
- **Current Label:** `expectNoMatch: true`
- **Deepened Candidate List Reality:** The untrimmed Tesco search returns 30 products, which include:
  - `320543444`: `Tesco Finest 0% Fat Greek Yoghurt 1KG` (£3.00)
  - `303631204`: `Tesco 0% Fat Greek Style Yogurt 1Kg` (£1.65)
- **Dispute:** Genuine 0% fat Greek yogurt 1kg products exist on the full shelf. Both rules and AI identify these products rather than declining.
- **Action Required:** Owner to relabel `expectedPick: "303631204"` / `"320543444"`.

### 3. `real-39` — "Wholewheat fusilli 1 kg"
- **Current Label:** `expectedPick: "308101449"` (`Tesco Whole Wheat Fusilli Pasta 500G`, 2 packs)
- **Deepened Candidate List Reality:** The untrimmed search includes `297484657`: `Tesco Wholewheat Fusilli Pasta 1kg` (£1.50).
- **Dispute:** A single 1kg pack fulfills the exact quantity without pack multiplication.
- **Action Required:** Owner to add `"297484657"` to `acceptablePicks` or promote to `expectedPick`.

### 4. `real-2` — "Large eggs 17"
- **Current Label:** `expectedPick: "308101449"` (`Big & Fresh Barn Eggs 6 Large`, 3 packs)
- **Deepened Candidate List Reality:** Untrimmed results include toy/chocolate novelty surprise eggs (`Character Surprise Egg 10G`).
- **Dispute:** While human shoppers understand "Large eggs" as chicken eggs, token matching without category filter can match "Egg".
- **Action Required:** Ensure category-based filtering or negative term filters exclude novelty eggs from grocery egg staples.

---

## Step 24: `reality-baseline.json` Historical Baseline Restored

In Step 24, `reality-baseline.json` was restored verbatim to its historically measured values from `92161c6` (measured on 2026-09-02: 58 items parsed, 57 matched, 1 no-match, 56 direct, Tesco basket £159.80, `unresolvedItems: ["Hummus"]`).

- **Historical Record:** The 2026-09-02 measurement recorded `"unresolvedItems": ["Hummus"]` as a snapshot of live retailer responses on that date prior to the Step 18 variant fixes. This historical measurement is maintained unchanged.



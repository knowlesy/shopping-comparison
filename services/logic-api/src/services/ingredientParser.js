/**
 * UK Grocery Ingredient & Shopping List Parser
 */

export function detectItemCategory(text) {
  const lower = text.toLowerCase();

  // 1. Compound word & exception rules (prevent "butter beans" -> dairy, "peanut butter" -> dairy, etc.)
  if (/\b(?:butter\s*beans?|peanut\s*butter|almond\s*butter|cashew\s*butter|cocoa\s*butter|apple\s*butter)\b/i.test(lower)) {
    return 'pantry';
  }
  if (/\b(?:butternut\s*squash)\b/i.test(lower)) {
    return 'produce';
  }
  if (/\b(?:coconut\s*(?:milk|cream))\b/i.test(lower)) {
    return 'pantry';
  }
  if (/\b(?:egg\s*(?:noodles?|pasta|fried\s*rice))\b/i.test(lower)) {
    return 'pantry';
  }
  if (/\b(?:garlic\s*(?:bread|baguette|butter))\b/i.test(lower)) {
    return 'bakery';
  }

  // 2. Standard Category word boundary matches
  if (
    /\b(?:beef|mince|chicken|pork|lamb|steak|bacon|sausage|sausages|meat|turkey|duck|gammon|veal|burgers?|meatballs?)\b/i.test(
      lower
    )
  )
    return 'meat';

  if (
    /\b(?:cod|salmon|haddock|tuna|prawn|prawns|fish|seafood|trout|mackerel|sea\s*bass|pollock|basa|sardines?|anchov(?:y|ies))\b/i.test(
      lower
    )
  )
    return 'fish';

  if (/\b(?:milk|yogurt|yoghurt|cheese|egg|eggs|butter|cream|cheddar|dairy|mozzarella|parmesan|gouda|feta)\b/i.test(lower))
    return 'dairy-eggs';

  if (
    /\b(?:potato|potatoes|carrot|carrots|onion|onions|garlic|courgette|courgettes|pepper|peppers|mushroom|mushrooms|tomato|tomatoes|spinach|apple|apples|banana|bananas|orange|oranges|berry|berries|lettuce|cucumber|salad|parsnip|parsnips|cabbage|peas|broccoli|celery|avocado|avocados|lemon|lemons|lime|limes|plum|plums|pear|pears|grape|grapes|fruit|fruits|vegetable|vegetables|leek|leeks|shallot|shallots|ginger|chili|chillies|chilli|squash)\b/i.test(
      lower
    )
  )
    return 'produce';

  if (
    /\b(?:pasta|fusilli|penne|spaghetti|lasagne|lasagna|rice|oat|oats|porridge|lentil|lentils|chia|walnut|walnuts|almond|almonds|nut|nuts|flour|sugar|oil|olive\s*oil|vinegar|salt|sauce|tin|tins|tinned|can|canned|beans|passata|puree|paste|noodles?|gravy|yeast|cocoa|honey|syrup|spices?|seasoning|hummus|sultanas?|raisins?|chickpeas?|stock|cubes?|oregano|thyme|rosemary|basil|parsley|sage|mint|herbs?|chocolate)\b/i.test(
      lower
    )
  )
    return 'pantry';

  if (
    /\b(?:bread|loaf|loaves|roll|rolls|bagel|bagels|pitta|pita|wrap|wraps|bakery|croissant|muffin|muffins|buns?)\b/i.test(
      lower
    )
  )
    return 'bakery';

  if (
    /\b(?:fairy|flash|spray|cleaner|detergent|bleach|tissue|toilet\s*roll|kitchen\s*roll|sponge|scourers?|soap|washing\s*up)\b/i.test(
      lower
    )
  )
    return 'household';

  return 'general';
}

function normalizeUnit(u) {
  if (!u) return 'item';
  const lower = u.toLowerCase();
  if (lower === 'lt' || lower === 'litre' || lower === 'litres') return 'l';
  if (lower === 'pints' || lower === 'pint' || lower === 'pt') return 'pints';
  if (lower === 'packs' || lower === 'pack' || lower === 'pk') return 'pack';
  if (lower === 'heads' || lower === 'head') return 'head';
  if (lower === 'bulbs' || lower === 'bulb') return 'bulb';
  if (lower === 'tubes' || lower === 'tube') return 'tube';
  if (lower === 'bunches' || lower === 'bunch') return 'bunch';
  if (lower === 'bottles' || lower === 'bottle') return 'bottle';
  if (lower === 'tins' || lower === 'tin' || lower === 'cans' || lower === 'can') return 'tin';
  if (lower === 'tubs' || lower === 'tub') return 'tub';
  if (lower === 'loaves' || lower === 'loaf') return 'loaf';
  if (lower === 'boxes' || lower === 'box') return 'box';
  if (lower === 'pots' || lower === 'pot') return 'pot';
  if (lower === 'jars' || lower === 'jar') return 'jar';
  if (lower === 'bags' || lower === 'bag') return 'bag';
  return lower;
}

export class IngredientParser {
  static parseItem(line, idx = 0) {
    const raw = line.trim();
    // Strip leading checkbox/bullet prefixes
    let text = raw.replace(/^(\d+[.)-]\s+|[-*•]\s*|\s*\[[\sxX]?\]\s*)+/i, '').trim();

    const parsed = {
      id: `item-${Date.now()}-${idx}`,
      rawText: line,
      name: text,
      baseItem: text,
      category: 'general',
      targetQuantity: 1,
      unit: 'item',
      checked: false,
      notes: [],
      dietaryNotes: [],
      alternateTerms: []
    };

    // 1. Parenthetical Notes Extraction (e.g. "(infant)", "(adults only, 85%)")
    const notesMatches = text.match(/\(([^)]+)\)/g);
    if (notesMatches) {
      for (const m of notesMatches) {
        const noteContent = m.replace(/[()]/g, '').trim();
        if (noteContent) parsed.notes.push(noteContent);
        text = text.replace(m, ' ').replace(/\s+/g, ' ').trim();
      }
    }

    // 2. "X or Y" Alternatives Extraction (e.g. "Plums or pears 600 g")
    const orMatch = text.match(/\b([a-zA-Z\s'-]+?)\s+or\s+([a-zA-Z\s'-]+?)(?=\s+\d|\s*$)/i);
    if (orMatch) {
      const primaryTerm = orMatch[1].trim();
      const altTerm = orMatch[2].trim();
      parsed.alternateTerms.push(altTerm);
      text = text.replace(orMatch[0], primaryTerm).trim();
    }

    // 3. Category Detection
    parsed.category = detectItemCategory(text);

    // 4. Health & Dietary Extraction
    // Fat % context: check if meat/dairy or explicit fat/lean context
    const fatExplicitMatch = text.match(/(\d+)%\s*(?:lean|fat|fat\s*free)?/i);
    if (fatExplicitMatch) {
      const pct = parseInt(fatExplicitMatch[1], 10);
      const isMeatOrDairy = parsed.category === 'meat' || parsed.category === 'dairy-eggs';
      const hasFatWord = /%\s*(?:lean|fat)/i.test(text);

      // Only assign fat percentage if contextualized (meat/dairy or explicit lean/fat wording)
      if (isMeatOrDairy || hasFatWord) {
        parsed.fatPercentage = pct;
        if (pct <= 5) {
          parsed.isHealthierPreferred = true;
          parsed.dietaryNotes.push(`${pct}% Low Fat`);
        }
        text = text.replace(/(\d+)%\s*(?:lean|fat)?/gi, ' ').replace(/\s+/g, ' ').trim();
      }
    }

    if (/\b(?:lean|extra\s*lean)\b/i.test(text)) {
      parsed.isHealthierPreferred = true;
      if (parsed.fatPercentage === undefined) parsed.fatPercentage = 5;
      text = text.replace(/\b(?:lean|extra\s*lean)\b/gi, ' ').replace(/\s+/g, ' ').trim();
    }

    if (/\b(?:wholewheat|wholemeal|wholegrain)\b/i.test(text)) {
      parsed.isWholewheat = true;
      parsed.isHealthierPreferred = true;
      parsed.dietaryNotes.push('Wholewheat');
    }

    if (/\b(?:free\s*range)\b/i.test(text)) {
      parsed.isFreeRange = true;
      parsed.dietaryNotes.push('Free Range');
    }

    if (/\b(?:organic)\b/i.test(text)) {
      parsed.isOrganic = true;
      parsed.dietaryNotes.push('Organic');
    }

    if (/\b(?:frozen)\b/i.test(text)) {
      parsed.isFrozen = true;
      parsed.dietaryNotes.push('Frozen');
    }

    // 5. Quantity & Unit Extraction
    let quantityExtracted = false;

    // 5A. Multiplier match anywhere: e.g. "3 x 400g chopped tomatoes", "Tinned sardines in olive oil 2 x 120 g"
    const multiMatch = text.match(
      /(?:^|\s)(\d+)\s*[xX*]\s*([\d.]+)\s*(kg|g|l|lt|litre|litres|ml|oz|lb|pack|packs|can|cans|tin|tins|bottle|bottles|bulbs?|tubes?|heads?|bunches|bunch)?(?:\s|$)/i
    );
    if (multiMatch) {
      const count = parseInt(multiMatch[1], 10);
      const size = parseFloat(multiMatch[2]);
      const rawUnit = multiMatch[3] || 'g';
      const u = normalizeUnit(rawUnit);

      parsed.multiplier = count;
      parsed.packSize = size;
      parsed.targetQuantity = count * size;
      parsed.unit = u;

      text = text.replace(multiMatch[0], ' ').replace(/\s+/g, ' ').trim();
      quantityExtracted = true;
    }

    // 5B. Pack count notation: e.g. "Little gem lettuce 2-pack", "Kitchen roll 2 pack"
    if (!quantityExtracted) {
      const packMatch = text.match(/(?:^|\s)(\d+)\s*[-]?\s*(?:pack|pk)\b/i);
      if (packMatch) {
        parsed.targetQuantity = parseInt(packMatch[1], 10);
        parsed.unit = 'pack';
        text = text.replace(packMatch[0], ' ').replace(/\s+/g, ' ').trim();
        quantityExtracted = true;
      }
    }

    // 5C. Trailing unit quantity: e.g. "Walnuts 200 g", "Beef mince 1.9 kg", "Potatoes 1.8kg", "Milk 4 pints", "Celery 1 head", "Garlic 1 bulb", "Tomato paste 1 tube"
    if (!quantityExtracted) {
      const trailingUnitMatch = text.match(
        /\b([\d.]+)\s*(kg|g|l|lt|litre|litres|ml|pints?|pt|oz|lb|heads?|bulbs?|tubes?|bunches?|bottles?|tins?|cans?|tubs?|loaves|loaf|boxes?|pots?|jars?|bags?)\s*$/i
      );
      if (trailingUnitMatch) {
        parsed.targetQuantity = parseFloat(trailingUnitMatch[1]);
        parsed.unit = normalizeUnit(trailingUnitMatch[2]);
        text = text.substring(0, trailingUnitMatch.index).trim();
        quantityExtracted = true;
      }
    }

    // 5D. Leading unit quantity: e.g. "900g beef mince", "1.6kg cod loins", "4 pints whole milk"
    if (!quantityExtracted) {
      const leadingUnitMatch = text.match(
        /^([\d.]+)\s*(kg|g|l|lt|litre|litres|ml|pints?|pt|oz|lb|heads?|bulbs?|tubes?|bunches?|bottles?|tins?|cans?|tubs?|loaves|loaf|boxes?|pots?|jars?|bags?)\s+(.*)$/i
      );
      if (leadingUnitMatch) {
        parsed.targetQuantity = parseFloat(leadingUnitMatch[1]);
        parsed.unit = normalizeUnit(leadingUnitMatch[2]);
        text = leadingUnitMatch[3].trim();
        quantityExtracted = true;
      }
    }

    // 5E. Bare trailing count: e.g. "Large eggs 17", "Bananas 10", "Red peppers 4", "Cucumber 1", "Oranges 6"
    if (!quantityExtracted) {
      const trailingCountMatch = text.match(/\b(\d+)\s*$/);
      if (trailingCountMatch) {
        parsed.targetQuantity = parseInt(trailingCountMatch[1], 10);
        parsed.unit = 'item';
        text = text.substring(0, trailingCountMatch.index).trim();
        quantityExtracted = true;
      }
    }

    // 5F. Bare leading count: e.g. "15 free range eggs", "4 lemons"
    if (!quantityExtracted) {
      const leadingCountMatch = text.match(/^(\d+)\s+([a-zA-Z].*)$/);
      if (leadingCountMatch) {
        parsed.targetQuantity = parseInt(leadingCountMatch[1], 10);
        parsed.unit = 'item';
        text = leadingCountMatch[2].trim();
      }
    }

    // Final clean up of baseItem and display name
    parsed.baseItem = text.trim();
    if (!parsed.baseItem) {
      parsed.baseItem = parsed.name;
    }
    parsed.name = parsed.baseItem;

    return parsed;
  }

  static parseList(lines) {
    if (!Array.isArray(lines)) {
      if (typeof lines === 'string') {
        lines = lines
          .split(/\r?\n/)
          .map((l) => l.trim())
          .filter((l) => l.length > 0);
      } else {
        return [];
      }
    }

    const result = [];
    let idx = 0;

    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (!line) continue;

      // Check for multi-item comma line (e.g. "Oregano, thyme, rosemary, basil, parsley, sage, mint")
      // Conditions: >= 3 comma-separated terms, each 1-3 words, no numbers
      const commaParts = line.split(',').map((p) => p.trim()).filter(Boolean);
      if (
        commaParts.length >= 3 &&
        commaParts.every((p) => !/\d/.test(p) && p.split(/\s+/).length <= 3)
      ) {
        for (const part of commaParts) {
          result.push(this.parseItem(part, idx++));
        }
      } else {
        result.push(this.parseItem(line, idx++));
      }
    }

    return result;
  }
}

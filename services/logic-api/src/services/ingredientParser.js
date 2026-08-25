/**
 * UK Grocery Ingredient & Shopping List Parser
 */

export function detectItemCategory(text) {
  const lower = text.toLowerCase();
  if (
    /\b(?:beef|mince|chicken|pork|lamb|steak|bacon|sausage|sausages|meat|turkey|duck|gammon|veal|burgers?|meatballs?)\b/i.test(
      lower
    )
  )
    return 'meat';
  if (
    /\b(?:cod|salmon|haddock|tuna|prawn|prawns|fish|seafood|trout|mackerel|sea bass|pollock|basa)\b/i.test(
      lower
    )
  )
    return 'fish';
  if (/\b(?:milk|yogurt|yoghurt|cheese|egg|eggs|butter|cream|cheddar|dairy)\b/i.test(lower))
    return 'dairy-eggs';
  if (
    /\b(?:potato|potatoes|carrot|carrots|onion|onions|garlic|courgette|courgettes|pepper|peppers|mushroom|mushrooms|tomato|tomatoes|spinach|apple|apples|banana|bananas|orange|oranges|berry|berries|lettuce|cucumber|salad|parsnip|parsnips|cabbage|peas|broccoli|celery|avocado|avocados|lemon|lemons|lime|limes|vegetables?|fruits?)\b/i.test(
      lower
    )
  )
    return 'produce';
  if (
    /\b(?:pasta|fusilli|penne|spaghetti|rice|oat|oats|porridge|lentil|lentils|chia|walnut|walnuts|almond|almonds|nut|nuts|flour|sugar|oil|olive oil|salt|sauce|tin|tins|tinned|can|canned|beans|passata|puree|noodles?|gravy|yeast|cocoa|honey|syrup|spices?|seasoning)\b/i.test(
      lower
    )
  )
    return 'pantry';
  if (
    /\b(?:bread|loaf|loaves|roll|rolls|bagel|bagels|pitta|wrap|wraps|bakery|croissant|muffin|buns?)\b/i.test(
      lower
    )
  )
    return 'bakery';
  if (
    /\b(?:fairy|flash|spray|cleaner|detergent|bleach|tissue|toilet roll|kitchen roll|sponge|scourers?|soap)\b/i.test(
      lower
    )
  )
    return 'household';
  return 'general';
}

export class IngredientParser {
  static parseItem(line, idx = 0) {
    let text = line.replace(/^(\d+[.)-]\s+|[-*•]\s*|\s*\[[\sxX]?\]\s*)+/i, '').trim();

    const parsed = {
      id: `item-${Date.now()}-${idx}`,
      rawText: line,
      name: text,
      baseItem: text,
      category: detectItemCategory(text),
      targetQuantity: 1,
      unit: 'item',
      checked: false,
      dietaryNotes: []
    };

    // Health / Dietary Extraction
    const fatMatch = text.match(/(\d+)%\s*(?:lean|fat)?/i);
    if (fatMatch) {
      parsed.fatPercentage = parseInt(fatMatch[1], 10);
      if (parsed.fatPercentage <= 5) {
        parsed.isHealthierPreferred = true;
        parsed.dietaryNotes.push(`${parsed.fatPercentage}% Low Fat`);
      }
    }

    if (/\b(?:lean|extra lean)\b/i.test(text)) {
      parsed.isHealthierPreferred = true;
      if (!parsed.fatPercentage) parsed.fatPercentage = 5;
    }

    if (/\b(?:wholewheat|wholemeal|wholegrain)\b/i.test(text)) {
      parsed.isWholewheat = true;
      parsed.isHealthierPreferred = true;
      parsed.dietaryNotes.push('Wholewheat');
    }

    if (/\b(?:free range)\b/i.test(text)) {
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

    // Multiplier: e.g. "3 x 400g", "2 x 500ml"
    const multiMatch = text.match(
      /^(\d+)\s*[xX*]\s*([\d.]+)\s*(kg|g|l|lt|litre|litres|ml|oz|lb|pack|can|tin|tins|bottle|bulbs?)\s+(.*)$/i
    );
    if (multiMatch) {
      const count = parseInt(multiMatch[1], 10);
      const size = parseFloat(multiMatch[2]);
      let u = multiMatch[3].toLowerCase();
      if (u === 'lt' || u === 'litre' || u === 'litres') u = 'l';

      parsed.multiplier = count;
      parsed.targetQuantity = count * size;
      parsed.unit = u;
      parsed.baseItem = multiMatch[4].trim();
      parsed.name = `${count}x${size}${u} ${parsed.baseItem}`;
      return parsed;
    }

    // Standard Quantity: e.g. "900g 5% lean beef mince", "1.6kg frozen cod loins"
    const qtyMatch = text.match(
      /^([\d.]+)\s*(kg|g|l|lt|litre|litres|ml|pack|packs|head|heads|bunch|bunches|bottle|bottles|tin|tins|tub|tubs|loaves|loaf|box|boxes|pints?)?\s+(.*)$/i
    );
    if (qtyMatch) {
      const qty = parseFloat(qtyMatch[1]);
      let u = (qtyMatch[2] || '').toLowerCase();
      if (u === 'lt' || u === 'litre' || u === 'litres') u = 'l';
      if (u === 'pints' || u === 'pint') u = 'pints';

      parsed.targetQuantity = qty;
      parsed.unit = u || 'item';
      parsed.baseItem = qtyMatch[3].trim();
      parsed.name = `${qty}${u ? u : ''} ${parsed.baseItem}`.trim();
      return parsed;
    }

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

    return lines.map((line, idx) => this.parseItem(line, idx));
  }
}

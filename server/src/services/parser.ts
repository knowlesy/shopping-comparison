import { ParsedItem } from '../types.js';

export class ShoppingListParser {
  /**
   * Parse a multiline or single string into structured ParsedItem objects
   */
  public static parse(rawInput: string): ParsedItem[] {
    if (!rawInput || typeof rawInput !== 'string') return [];

    const lines = rawInput
      .split(/\r?\n/)
      .map(l => l.trim())
      .filter(l => l.length > 0 && !l.startsWith('#') && !l.startsWith('//'));

    return lines.map((line, index) => this.parseLine(line, `item-${Date.now()}-${index}`));
  }

  /**
   * Parse an individual line
   */
  public static parseLine(line: string, id?: string): ParsedItem {
    const rawText = line.trim();
    let text = rawText;

    // Remove leading bullet points, numbered lists, checkboxes (e.g. "1. ", "1) ", "- ", "* ", "• ", "- [ ] ", "- [x] ", "[x] ")
    text = text.replace(/^(\d+[\.\)\-]\s+|[-*•]\s*|\s*\[[\sxX]?\]\s*)+/i, '').trim();

    // Default structure
    const parsed: ParsedItem = {
      id: id || `item-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
      rawText,
      name: text,
      baseItem: text,
      category: 'general',
      targetQuantity: 1,
      unit: 'item',
      checked: false,
      dietaryNotes: [],
    };

    // 1. Detect Brand Preferences
    const brands = ['Mutti Polpa', 'Mutti', 'Fairy', 'Flash', 'Warburtons', 'Hovis', 'Lurpak', 'Napolina', 'Quaker', 'Filippo Berio', 'Dettol', 'Andrex'];
    for (const brand of brands) {
      const regex = new RegExp(`\\b${brand}\\b`, 'i');
      if (regex.test(text)) {
        parsed.brandPreference = brand;
        break;
      }
    }

    // 2. Detect Health / Dietary Attributes
    // Fat percentage: "5% lean", "5% fat", "0% fat", "0%", "20% fat"
    const fatMatch = text.match(/(\d+)%\s*(?:lean|fat)?/i);
    if (fatMatch) {
      parsed.fatPercentage = parseInt(fatMatch[1], 10);
      if (parsed.fatPercentage <= 5) {
        parsed.isHealthierPreferred = true;
        parsed.dietaryNotes?.push(`${parsed.fatPercentage}% Low Fat`);
      }
    }

    if (/\b(?:lean|extra lean)\b/i.test(text)) {
      parsed.isHealthierPreferred = true;
      if (!parsed.fatPercentage) parsed.fatPercentage = 5;
    }

    if (/\b(?:wholewheat|wholemeal|wholegrain)\b/i.test(text)) {
      parsed.isWholewheat = true;
      parsed.isHealthierPreferred = true;
      parsed.dietaryNotes?.push('Wholewheat / Wholemeal');
    }

    if (/\b(?:free range)\b/i.test(text)) {
      parsed.isFreeRange = true;
      parsed.dietaryNotes?.push('Free Range');
    }

    if (/\b(?:organic)\b/i.test(text)) {
      parsed.isOrganic = true;
      parsed.dietaryNotes?.push('Organic');
    }

    // 3. Multiplier with packaging pattern: e.g. "3 x 400g", "2 x 500ml", "4x400g"
    const multiMatch = text.match(/^(\d+)\s*[xX*]\s*([\d.]+)\s*(kg|g|l|lt|litre|litres|ml|oz|lb|pack|can|tin|tins|bottle|bulbs?)\s+(.*)$/i);
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
      this.assignCategory(parsed);
      return parsed;
    }

    // 4. Standard Quantity with Unit pattern: e.g. "900g 5% lean beef mince", "1.6kg frozen cod loins", "1.13L semi-skimmed milk", "15 free range eggs"
    const qtyUnitMatch = text.match(/^([\d.]+)\s*(kg|g|l|lt|litre|litres|ml|pack|packs|head|heads|bunch|bunches|bottle|bottles|tin|tins|tub|tubs|loaves|loaf|box|boxes)?\s+(.*)$/i);

    if (qtyUnitMatch) {
      const qty = parseFloat(qtyUnitMatch[1]);
      let u = (qtyUnitMatch[2] || '').toLowerCase();
      let rest = qtyUnitMatch[3].trim();

      if (u === 'lt' || u === 'litre' || u === 'litres') u = 'l';
      if (u === 'bunches') u = 'bunch';
      if (u === 'heads') u = 'head';
      if (u === 'packs') u = 'pack';
      if (u === 'bottles') u = 'bottle';
      if (u === 'tins') u = 'tin';

      // If unit wasn't specified but word indicates items, e.g. "15 free range eggs"
      if (!u) {
        if (/eggs|apples|bananas|oranges|lemons|potatoes|peppers|bulbs/i.test(rest)) {
          u = 'item';
        } else {
          u = 'item';
        }
      }

      parsed.targetQuantity = qty;
      parsed.unit = u || 'item';
      parsed.baseItem = rest;
      parsed.name = `${qty}${u !== 'item' ? u : ''} ${rest}`.trim();
      this.assignCategory(parsed);
      return parsed;
    }

    // 5. Fallback: single item without explicit leading quantity
    parsed.targetQuantity = 1;
    parsed.unit = 'item';
    parsed.baseItem = text;
    parsed.name = text;
    this.assignCategory(parsed);
    return parsed;
  }

  /**
   * Determine category from base item text
   */
  private static assignCategory(item: ParsedItem): void {
    const text = (item.baseItem + ' ' + item.name).toLowerCase();

    if (/beef|mince|chicken|pork|lamb|steak|bacon|sausage|meat/i.test(text)) {
      item.category = 'meat';
    } else if (/cod|salmon|haddock|tuna|prawn|fish|seafood/i.test(text)) {
      item.category = 'fish';
    } else if (/milk|yogurt|yoghurt|cheese|egg|eggs|butter|cream|cheddar/i.test(text)) {
      item.category = 'dairy-eggs';
    } else if (/potato|potatoes|carrot|carrots|onion|onions|garlic|courgette|courgettes|pepper|peppers|mushroom|mushrooms|tomato|tomatoes|spinach|celery|banana|bananas|pear|pears|clementine|clementines|apple|apples|salad/i.test(text)) {
      item.category = 'produce';
    } else if (/bread|loaf|roll|bagel|pitta|wrap|croissant|bakery/i.test(text)) {
      item.category = 'bakery';
    } else if (/pasta|fusilli|penne|spaghetti|rice|oat|oats|porridge|lentil|lentils|chia|walnut|walnuts|almond|almonds|nut|nuts|oil|puree|polpa|cereal|flour|sugar|beans/i.test(text)) {
      item.category = 'pantry';
    } else if (/fairy|flash|spray|cleaner|detergent|bleach|dettol|tissue|toilet|kitchen roll|sponge/i.test(text)) {
      item.category = 'household';
    } else {
      item.category = 'general';
    }
  }
}

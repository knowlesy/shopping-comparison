import { SupermarketName, IngredientIdea } from '../types';

export const DEFAULT_INGREDIENT_IDEAS: IngredientIdea[] = [
  {
    id: 'idea-1',
    name: '5% Lean Beef Mince',
    category: 'protein',
    defaultFormat: '900g 5% lean beef mince',
    icon: '🥩',
    isPopular: true,
  },
  {
    id: 'idea-2',
    name: 'Frozen Cod Loins',
    category: 'protein',
    defaultFormat: '1.6kg frozen cod loins',
    icon: '🐟',
    isPopular: true,
  },
  {
    id: 'idea-3',
    name: 'Chicken Breast Fillets',
    category: 'protein',
    defaultFormat: '1kg chicken breast fillets',
    icon: '🍗',
    isPopular: true,
  },
  {
    id: 'idea-4',
    name: 'Free Range Eggs',
    category: 'dairy',
    defaultFormat: '15 free range eggs',
    icon: '🥚',
    isPopular: true,
  },
  {
    id: 'idea-5',
    name: 'Greek Yogurt 0%',
    category: 'dairy',
    defaultFormat: '1kg authentic Greek yogurt 0%',
    icon: '🥣',
    isPopular: true,
  },
  {
    id: 'idea-6',
    name: 'Semi-Skimmed Milk',
    category: 'dairy',
    defaultFormat: '1.13L semi-skimmed milk',
    icon: '🥛',
    isPopular: true,
  },
  {
    id: 'idea-7',
    name: 'Tinned Brown Lentils',
    category: 'pantry',
    defaultFormat: '800g tinned brown lentils',
    icon: '🥫',
    isPopular: true,
  },
  {
    id: 'idea-8',
    name: 'Wholewheat Fusilli',
    category: 'pantry',
    defaultFormat: '1kg wholewheat fusilli',
    icon: '🍝',
    isPopular: true,
  },
  {
    id: 'idea-9',
    name: 'Scottish Rolled Oats',
    category: 'pantry',
    defaultFormat: '1kg Scottish rolled oats',
    icon: '🌾',
    isPopular: true,
  },
  {
    id: 'idea-10',
    name: 'Wholemeal Bread',
    category: 'bakery',
    defaultFormat: '800g wholemeal sliced bread',
    icon: '🍞',
    isPopular: true,
  },
  {
    id: 'idea-11',
    name: 'Mutti Polpa Tomatoes',
    category: 'pantry',
    defaultFormat: '3 x 400g Mutti Polpa chopped tomatoes',
    icon: '🥫',
    isPopular: true,
  },
  {
    id: 'idea-12',
    name: 'Tomato Puree',
    category: 'pantry',
    defaultFormat: '200g tomato puree',
    icon: '🍅',
    isPopular: true,
  },
  {
    id: 'idea-13',
    name: 'Extra Virgin Olive Oil',
    category: 'pantry',
    defaultFormat: '500ml extra virgin olive oil',
    icon: '🫒',
    isPopular: true,
  },
  {
    id: 'idea-14',
    name: 'Baby New Potatoes',
    category: 'produce',
    defaultFormat: '2kg baby new potatoes',
    icon: '🥔',
    isPopular: true,
  },
  {
    id: 'idea-15',
    name: 'Courgettes',
    category: 'produce',
    defaultFormat: '1kg courgettes',
    icon: '🥒',
    isPopular: true,
  },
  {
    id: 'idea-16',
    name: 'Mixed Bell Peppers',
    category: 'produce',
    defaultFormat: '1kg mixed bell peppers',
    icon: '🫑',
    isPopular: true,
  },
  {
    id: 'idea-17',
    name: 'Closed Cup Mushrooms',
    category: 'produce',
    defaultFormat: '400g closed cup mushrooms',
    icon: '🍄',
    isPopular: true,
  },
  {
    id: 'idea-18',
    name: 'Baby Plum Tomatoes',
    category: 'produce',
    defaultFormat: '600g baby plum tomatoes',
    icon: '🍅',
    isPopular: true,
  },
  {
    id: 'idea-19',
    name: 'Fresh Carrots',
    category: 'produce',
    defaultFormat: '1kg carrots',
    icon: '🥕',
    isPopular: true,
  },
  {
    id: 'idea-20',
    name: 'Celery Head',
    category: 'produce',
    defaultFormat: '1 head celery',
    icon: '🥬',
    isPopular: true,
  },
  {
    id: 'idea-21',
    name: 'Brown Onions',
    category: 'produce',
    defaultFormat: '1kg brown onions',
    icon: '🧅',
    isPopular: true,
  },
  {
    id: 'idea-22',
    name: 'Red Onions',
    category: 'produce',
    defaultFormat: '1kg red onions',
    icon: '🧅',
    isPopular: true,
  },
  {
    id: 'idea-23',
    name: 'Garlic Bulbs',
    category: 'produce',
    defaultFormat: '1 pack garlic bulbs',
    icon: '🧄',
    isPopular: true,
  },
  {
    id: 'idea-24',
    name: 'Fresh Baby Spinach',
    category: 'produce',
    defaultFormat: '240g fresh baby spinach',
    icon: '🥗',
    isPopular: true,
  },
  {
    id: 'idea-25',
    name: 'Bananas Bunch',
    category: 'produce',
    defaultFormat: '1 bunch bananas',
    icon: '🍌',
    isPopular: true,
  },
  {
    id: 'idea-26',
    name: 'Conference Pears',
    category: 'produce',
    defaultFormat: '800g conference pears',
    icon: '🍐',
    isPopular: true,
  },
  {
    id: 'idea-27',
    name: 'Sweet Clementines',
    category: 'produce',
    defaultFormat: '600g clementines',
    icon: '🍊',
    isPopular: true,
  },
  {
    id: 'idea-28',
    name: 'Walnuts & Almonds Mix',
    category: 'pantry',
    defaultFormat: '200g walnut halves and whole almonds',
    icon: '🥜',
    isPopular: true,
  },
  {
    id: 'idea-29',
    name: 'Chia Seeds',
    category: 'pantry',
    defaultFormat: '150g chia seeds',
    icon: '🌱',
    isPopular: true,
  },
  {
    id: 'idea-30',
    name: 'Fairy Liquid',
    category: 'household',
    defaultFormat: '1 bottle Fairy washing up liquid',
    icon: '🧼',
    isPopular: true,
  },
  {
    id: 'idea-31',
    name: 'Flash Spray',
    category: 'household',
    defaultFormat: '1 bottle Flash all purpose spray',
    icon: '✨',
    isPopular: true,
  },
];

export function extractSearchQuery(text: string): string {
  let clean = text
    .replace(/\(.*?\)/g, '')
    .replace(/\b(asda|tesco|sainsbury'?s?|morrisons?|iceland|just essentials|by sainsbury'?s?|british|scottish|succulent|crisp|sweet|crunchy|fresh|organic|authentic|medium|sliced|fine|double concentrate)\b/gi, '')
    .replace(/\b\d+\s*(?:kg|g|l|lt|ml|pk|pack|heads?|bunches?|tins?|pots?|bottles?|loaves|loaf|pints?)\b/gi, '')
    .replace(/\b\d+%\s*(?:fat|lean)?\b/gi, '')
    .replace(/['’]/g, '')
    .replace(/%/g, ' ')
    .replace(/[^a-zA-Z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (!clean || clean.length < 3) {
    clean = text.replace(/[^a-zA-Z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
  }
  return clean;
}

export function getLiveSupermarketUrl(supermarket: SupermarketName, title: string, productUrl?: string): string {
  // If productUrl is a verified modern direct link, use it
  if (
    productUrl &&
    (productUrl.startsWith('https://www.asda.com/groceries/product/') ||
     productUrl.startsWith('https://www.sainsburys.co.uk/gol-ui/product/') ||
     productUrl.startsWith('https://www.tesco.com/groceries/en-GB/products/') ||
     productUrl.startsWith('https://www.tesco.com/groceries/en-GB/shop/') ||
     productUrl.startsWith('https://groceries.morrisons.com/browse/') ||
     productUrl.startsWith('https://groceries.morrisons.com/products/') ||
     productUrl.startsWith('https://www.iceland.co.uk/p/')) &&
    !productUrl.includes('91000') &&
    !productUrl.includes('1000185923841')
  ) {
    return productUrl;
  }

  const clean = extractSearchQuery(title);
  const enc = encodeURIComponent(clean);
  const plusEnc = enc.replace(/%20/g, '+');

  switch (supermarket) {
    case 'asda':
      return `https://www.asda.com/groceries/search/${enc}`;
    case 'tesco':
      return `https://www.tesco.com/groceries/en-GB/search?query=${plusEnc}`;
    case 'sainsburys':
      return `https://www.sainsburys.co.uk/gol-ui/SearchResults/${enc}`;
    case 'morrisons':
      return `https://groceries.morrisons.com/search?entry=${enc}`;
    case 'iceland':
      return `https://www.iceland.co.uk/search?q=${plusEnc}`;
    case 'waitrose':
      return `https://www.waitrose.com/ecom/shop/search?&searchTerm=${enc}`;
    case 'ocado':
      return `https://www.ocado.com/search?entry=${enc}`;
    case 'coop':
      return `https://www.coop.co.uk/search?q=${plusEnc}`;
    case 'aldi':
      return `https://groceries.aldi.co.uk/en-GB/Search?keywords=${enc}`;
    case 'lidl':
      return `https://www.lidl.co.uk/search?query=${plusEnc}`;
    default:
      return `https://www.google.co.uk/search?q=${plusEnc}+${supermarket}`;
  }
}

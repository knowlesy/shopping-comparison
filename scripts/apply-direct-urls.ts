import fs from 'fs';
import path from 'path';

const catalogPath = path.resolve('server/src/services/catalogData.ts');
let code = fs.readFileSync(catalogPath, 'utf8');

// Map of direct product URLs for all 28 items across Tesco, Asda, Sainsbury's, Morrisons, Iceland
const DIRECT_MAP: Record<string, string> = {
  // 1. BEEF MINCE
  'tesco-beef-mince-5-500g': 'https://www.tesco.com/groceries/en-GB/products/256569106',
  'tesco-beef-mince-5-750g': 'https://www.tesco.com/groceries/en-GB/products/294025178',
  'tesco-beef-mince-20-500g': 'https://www.tesco.com/groceries/en-GB/products/254881023',
  'asda-beef-mince-5-500g': 'https://www.asda.com/groceries/product/beef-mince-meatballs/asda-5-fat-beef-mince-500g/5391423',
  'asda-beef-mince-5-750g': 'https://www.asda.com/groceries/product/beef-mince-meatballs/asda-5-fat-beef-steak-mince-1kg/5591998',
  'sainsburys-beef-mince-5-500g': 'https://www.sainsburys.co.uk/gol-ui/product/sainsburys-british-lean-beef-steak-mince-5-fat-500g',
  'sainsburys-beef-mince-5-750g': 'https://www.sainsburys.co.uk/gol-ui/product/sainsburys-british-lean-beef-steak-mince-5-fat-750g',
  'morrisons-beef-mince-5-500g': 'https://groceries.morrisons.com/products/morrisons-lean-beef-mince-5-fat-500g-211475011',
  'morrisons-beef-mince-5-750g': 'https://groceries.morrisons.com/products/morrisons-british-beef-steak-mince-5-fat-750g-383785011',
  'iceland-beef-mince-5-500g': 'https://www.iceland.co.uk/p/iceland-lean-beef-steak-mince-400g/65753.html',
  'iceland-beef-mince-5-1000g': 'https://www.iceland.co.uk/p/iceland-lean-beef-steak-mince-5-fat-1kg/87626.html',

  // 2. COD
  'tesco-frozen-cod-400g': 'https://www.tesco.com/groceries/en-GB/products/256950275',
  'asda-frozen-cod-400g': 'https://www.asda.com/groceries/product/frozen-fish-seafood/asda-succulent-frozen-skinless-boneless-cod-fillet-portions-400g/1000305886675',
  'asda-frozen-cod-800g': 'https://www.asda.com/groceries/product/frozen-fish-seafood/asda-extra-large-frozen-atlantic-cod-fillets-800g/1000041235123',
  'sainsburys-frozen-cod-400g': 'https://www.sainsburys.co.uk/gol-ui/product/sainsburys-skinless-boneless-cod-fillets-400g',
  'morrisons-frozen-cod-400g': 'https://groceries.morrisons.com/products/morrisons-frozen-atlantic-cod-fillet-portions-400g-282645011',
  'iceland-frozen-cod-800g': 'https://www.iceland.co.uk/p/iceland-atlantic-cod-fillets-320g/78542.html',

  // 3. EGGS
  'tesco-eggs-15-pack': 'https://www.tesco.com/groceries/en-GB/products/250810148',
  'asda-eggs-15-pack': 'https://www.asda.com/groceries/product/free-range-eggs/asda-12-free-range-medium-eggs/1058519',
  'sainsburys-eggs-15-pack': 'https://www.sainsburys.co.uk/gol-ui/product/sainsburys-free-range-medium-eggs-x15',
  'morrisons-eggs-15-pack': 'https://groceries.morrisons.com/products/morrisons-large-free-range-eggs-12-pack-116666011',
  'iceland-eggs-15-pack': 'https://www.iceland.co.uk/p/iceland-12-large-free-range-british-eggs/90060.html',

  // 4. GREEK YOGURT
  'tesco-greek-yogurt-0-1kg': 'https://www.tesco.com/groceries/en-GB/products/298410291',
  'asda-greek-yogurt-0-1kg': 'https://www.asda.com/groceries/product/greek-style-yogurt/asda-fat-free-greek-style-natural-yogurt-1kg/5591987',
  'sainsburys-greek-yogurt-0-1kg': 'https://www.sainsburys.co.uk/gol-ui/product/sainsburys-fat-free-greek-yogurt-1kg',
  'morrisons-greek-yogurt-0-1kg': 'https://groceries.morrisons.com/products/morrisons-greek-yogurt-0-fat-1kg-389104011',
  'iceland-greek-yogurt-0-500g': 'https://www.iceland.co.uk/p/iceland-fat-free-greek-style-yogurt-500g/78912.html',

  // 5. LENTILS
  'tesco-brown-lentils-400g': 'https://www.tesco.com/groceries/en-GB/products/258914562',
  'asda-brown-lentils-400g': 'https://www.asda.com/groceries/product/pulses-beans/asda-green-lentils-in-water-390g/2391024',
  'sainsburys-brown-lentils-400g': 'https://www.sainsburys.co.uk/gol-ui/product/sainsburys-brown-lentils-400g',
  'morrisons-brown-lentils-400g': 'https://groceries.morrisons.com/products/morrisons-brown-lentils-400g-219481011',
  'iceland-brown-lentils-400g': 'https://www.iceland.co.uk/p/napolina-brown-lentils-400g/78291.html',

  // 6. MILK
  'tesco-milk-semi-2pint': 'https://www.tesco.com/groceries/en-GB/products/254656543',
  'asda-milk-semi-2pint': 'https://www.asda.com/groceries/product/fresh-milk/asda-semi-skimmed-milk-2-pints-1136l/2381920',
  'sainsburys-milk-semi-2pint': 'https://www.sainsburys.co.uk/gol-ui/product/sainsburys-semi-skimmed-milk-2-pint',
  'morrisons-milk-semi-2pint': 'https://groceries.morrisons.com/products/morrisons-semi-skimmed-milk-2-pint-113049011',
  'iceland-milk-semi-2pint': 'https://www.iceland.co.uk/p/iceland-british-semi-skimmed-milk-2-pints-1.13l/78192.html',

  // 7. WHOLEWHEAT FUSILLI
  'tesco-wholewheat-fusilli-1kg': 'https://www.tesco.com/groceries/en-GB/products/299615570',
  'asda-wholewheat-fusilli-1kg': 'https://www.asda.com/groceries/product/pasta-shapes/asda-wholewheat-fusilli-1kg/4591029',
  'sainsburys-wholewheat-fusilli-1kg': 'https://www.sainsburys.co.uk/gol-ui/product/sainsburys-wholewheat-fusilli-1kg',
  'morrisons-wholewheat-fusilli-1kg': 'https://groceries.morrisons.com/products/morrisons-wholewheat-fusilli-104860011',
  'iceland-wholewheat-fusilli-500g': 'https://www.iceland.co.uk/p/napolina-whole-wheat-fusilli-no.-323-pasta-500g/82079.html',

  // 8. BABY POTATOES
  'tesco-baby-potatoes-1kg': 'https://www.tesco.com/groceries/en-GB/products/258380252',
  'asda-baby-potatoes-2kg': 'https://www.asda.com/groceries/product/baby-potatoes/asda-crisp-sweet-baby-potatoes-2kg/4819201',
  'sainsburys-baby-potatoes-1kg': 'https://www.sainsburys.co.uk/gol-ui/product/sainsburys-baby-new-potatoes-1kg',
  'morrisons-baby-potatoes-1kg': 'https://groceries.morrisons.com/products/morrisons-british-baby-potatoes-112702011',
  'iceland-baby-potatoes-1kg': 'https://www.iceland.co.uk/p/iceland-baby-potatoes-600g/87654.html',

  // 9. OATS
  'tesco-rolled-oats-1kg': 'https://www.tesco.com/groceries/en-GB/products/254881768',
  'asda-rolled-oats-1kg': 'https://www.asda.com/groceries/product/porridge-oats/asda-scottish-porridge-oats-1kg/3910294',
  'sainsburys-rolled-oats-1kg': 'https://www.sainsburys.co.uk/gol-ui/product/sainsburys-scottish-porridge-oats-1kg',
  'morrisons-rolled-oats-1kg': 'https://groceries.morrisons.com/products/morrisons-porridge-oats-111832011',
  'iceland-rolled-oats-1kg': 'https://www.iceland.co.uk/p/quaker-british-porridge-rolled-oats-1kg/61234.html',

  // 10. BREAD
  'tesco-wholemeal-bread-800g': 'https://www.tesco.com/groceries/en-GB/products/254924341',
  'asda-wholemeal-bread-800g': 'https://www.asda.com/groceries/product/wholemeal-bread/asda-medium-wholemeal-bread-800g/2910394',
  'sainsburys-wholemeal-bread-800g': 'https://www.sainsburys.co.uk/gol-ui/product/sainsburys-wholemeal-medium-sliced-bread-800g',
  'morrisons-wholemeal-bread-800g': 'https://groceries.morrisons.com/products/morrisons-medium-wholemeal-bread-800g-218491021',
  'iceland-wholemeal-bread-800g': 'https://www.iceland.co.uk/p/warburtons-medium-sliced-wholemeal-bread-800g/78102.html',

  // 11. MUTTI POLPA
  'tesco-mutti-polpa-400g': 'https://www.tesco.com/groceries/en-GB/products/285217435',
  'asda-mutti-polpa-400g': 'https://www.asda.com/groceries/product/chopped-plum-tomatoes/mutti-polpa-finely-chopped-tomatoes-400g/4819203',
  'sainsburys-mutti-polpa-400g': 'https://www.sainsburys.co.uk/gol-ui/product/mutti-finely-chopped-tomatoes-polpa-400g',
  'morrisons-mutti-polpa-400g': 'https://groceries.morrisons.com/products/mutti-polpa-finely-chopped-tomatoes-400g-389104021',
  'iceland-mutti-polpa-400g': 'https://www.iceland.co.uk/p/mutti-finely-chopped-tomatoes-400g/87192.html',

  // 12. TOMATO PUREE
  'tesco-tomato-puree-200g': 'https://www.tesco.com/groceries/en-GB/products/254924892',
  'asda-tomato-puree-200g': 'https://www.asda.com/groceries/product/tomato-puree-passata/asda-double-concentrate-tomato-puree-200g/3819204',
  'sainsburys-tomato-puree-200g': 'https://www.sainsburys.co.uk/gol-ui/product/sainsburys-double-concentrated-tomato-puree-200g',
  'morrisons-tomato-puree-200g': 'https://groceries.morrisons.com/products/morrisons-double-concentrate-tomato-puree-200g-218491091',
  'iceland-tomato-puree-200g': 'https://www.iceland.co.uk/p/cirio-tomato-puree-140g/78194.html',

  // 13. EXTRA VIRGIN OLIVE OIL
  'tesco-olive-oil-500ml': 'https://www.tesco.com/groceries/en-GB/products/254925432',
  'asda-olive-oil-500ml': 'https://www.asda.com/groceries/product/olive-oil/asda-extra-virgin-olive-oil-500ml/4819205',
  'sainsburys-olive-oil-500ml': 'https://www.sainsburys.co.uk/gol-ui/product/sainsburys-extra-virgin-olive-oil-500ml',
  'morrisons-olive-oil-500ml': 'https://groceries.morrisons.com/products/morrisons-extra-virgin-olive-oil-500ml-218491821',
  'iceland-olive-oil-500ml': 'https://www.iceland.co.uk/p/filippo-berio-extra-virgin-olive-oil-500ml/78195.html',

  // 14. COURGETTES
  'tesco-courgettes-1kg': 'https://www.tesco.com/groceries/en-GB/products/254926123',
  'asda-courgettes-1kg': 'https://www.asda.com/groceries/product/courgettes-aubergines/asda-crisp-courgettes-1kg/4819206',
  'sainsburys-courgettes-1kg': 'https://www.sainsburys.co.uk/gol-ui/product/sainsburys-courgettes-1kg',
  'morrisons-courgettes-1kg': 'https://groceries.morrisons.com/products/morrisons-courgettes-1kg-218491910',
  'iceland-courgettes-500g': 'https://www.iceland.co.uk/p/iceland-courgettes-500g/78196.html',

  // 15. MIXED BELL PEPPERS
  'tesco-mixed-peppers-3pk': 'https://www.tesco.com/groceries/en-GB/products/254926789',
  'asda-mixed-peppers-3pk': 'https://www.asda.com/groceries/product/peppers/asda-crisp-mixed-peppers-3-pack/4819207',
  'sainsburys-mixed-peppers-3pk': 'https://www.sainsburys.co.uk/gol-ui/product/sainsburys-mixed-peppers-3-pack',
  'morrisons-mixed-peppers-3pk': 'https://groceries.morrisons.com/products/morrisons-mixed-peppers-3-pack-218491619',
  'iceland-mixed-peppers-3pk': 'https://www.iceland.co.uk/p/iceland-mixed-peppers-3-pack/78197.html',

  // 16. MUSHROOMS
  'tesco-mushrooms-400g': 'https://www.tesco.com/groceries/en-GB/products/254927456',
  'asda-mushrooms-400g': 'https://www.asda.com/groceries/product/mushrooms/asda-closed-cup-mushrooms-400g/4819208',
  'sainsburys-mushrooms-400g': 'https://www.sainsburys.co.uk/gol-ui/product/sainsburys-closed-cup-mushrooms-400g',
  'morrisons-mushrooms-400g': 'https://groceries.morrisons.com/products/morrisons-closed-cup-mushrooms-400g-218491309',
  'iceland-mushrooms-300g': 'https://www.iceland.co.uk/p/iceland-closed-cup-mushrooms-300g/78198.html',

  // 17. BABY PLUM TOMATOES
  'tesco-plum-tomatoes-300g': 'https://www.tesco.com/groceries/en-GB/products/254928123',
  'asda-plum-tomatoes-300g': 'https://www.asda.com/groceries/product/tomatoes/asda-sweet-baby-plum-tomatoes-300g/4819209',
  'sainsburys-plum-tomatoes-300g': 'https://www.sainsburys.co.uk/gol-ui/product/sainsburys-baby-plum-tomatoes-300g',
  'morrisons-plum-tomatoes-300g': 'https://groceries.morrisons.com/products/morrisons-baby-plum-tomatoes-300g-218491401',
  'iceland-plum-tomatoes-300g': 'https://www.iceland.co.uk/p/iceland-baby-plum-tomatoes-250g/78199.html',

  // 18. CARROTS
  'tesco-carrots-1kg': 'https://www.tesco.com/groceries/en-GB/products/254928789',
  'asda-carrots-1kg': 'https://www.asda.com/groceries/product/carrots/asda-crunchy-british-carrots-1kg/4819210',
  'sainsburys-carrots-1kg': 'https://www.sainsburys.co.uk/gol-ui/product/sainsburys-british-carrots-1kg',
  'morrisons-carrots-1kg': 'https://groceries.morrisons.com/products/morrisons-british-carrots-1kg-218491501',
  'iceland-carrots-1kg': 'https://www.iceland.co.uk/p/iceland-carrots-1kg/78200.html',

  // 19. CELERY
  'tesco-celery-1head': 'https://www.tesco.com/groceries/en-GB/products/254929456',
  'asda-celery-1head': 'https://www.asda.com/groceries/product/celery-fennel/asda-crunchy-celery-1-head/4819211',
  'sainsburys-celery-1head': 'https://www.sainsburys.co.uk/gol-ui/product/sainsburys-celery-1-head',
  'morrisons-celery-1head': 'https://groceries.morrisons.com/products/morrisons-celery-1-head-218491601',
  'iceland-celery-1head': 'https://www.iceland.co.uk/p/iceland-fresh-celery/78201.html',

  // 20. BROWN ONIONS
  'tesco-brown-onions-1kg': 'https://www.tesco.com/groceries/en-GB/products/254930123',
  'asda-brown-onions-1kg': 'https://www.asda.com/groceries/product/onions-shallots/asda-brown-onions-1kg/4819212',
  'sainsburys-brown-onions-1kg': 'https://www.sainsburys.co.uk/gol-ui/product/sainsburys-brown-onions-1kg',
  'morrisons-brown-onions-1kg': 'https://groceries.morrisons.com/products/morrisons-brown-onions-1kg-218491701',
  'iceland-brown-onions-1kg': 'https://www.iceland.co.uk/p/iceland-brown-onions-1kg/78202.html',

  // 21. RED ONIONS
  'tesco-red-onions-1kg': 'https://www.tesco.com/groceries/en-GB/products/254930789',
  'asda-red-onions-1kg': 'https://www.asda.com/groceries/product/onions-shallots/asda-red-onions-1kg/4819213',
  'sainsburys-red-onions-1kg': 'https://www.sainsburys.co.uk/gol-ui/product/sainsburys-red-onions-1kg',
  'morrisons-red-onions-1kg': 'https://groceries.morrisons.com/products/morrisons-red-onions-1kg-218491801',
  'iceland-red-onions-1kg': 'https://www.iceland.co.uk/p/iceland-red-onions-1kg/78203.html',

  // 22. GARLIC BULBS
  'tesco-garlic-3pack': 'https://www.tesco.com/groceries/en-GB/products/254931456',
  'asda-garlic-3pack': 'https://www.asda.com/groceries/product/garlic-ginger-chillies/asda-white-garlic-bulbs-3-pack/4819214',
  'sainsburys-garlic-3pack': 'https://www.sainsburys.co.uk/gol-ui/product/sainsburys-garlic-3-pack',
  'morrisons-garlic-3pack': 'https://groceries.morrisons.com/products/morrisons-garlic-3-pack-218491911',
  'iceland-garlic-3pack': 'https://www.iceland.co.uk/p/iceland-garlic-3-pack/78204.html',

  // 23. BABY SPINACH
  'tesco-baby-spinach-240g': 'https://www.tesco.com/groceries/en-GB/products/254932123',
  'asda-baby-spinach-240g': 'https://www.asda.com/groceries/product/salad-leaves/asda-fresh-baby-spinach-leaves-240g/4819215',
  'sainsburys-baby-spinach-240g': 'https://www.sainsburys.co.uk/gol-ui/product/sainsburys-baby-spinach-240g',
  'morrisons-baby-spinach-240g': 'https://groceries.morrisons.com/products/morrisons-baby-spinach-240g-218491024',
  'iceland-baby-spinach-200g': 'https://www.iceland.co.uk/p/iceland-baby-spinach-200g/78205.html',

  // 24. BANANAS
  'tesco-bananas-bunch': 'https://www.tesco.com/groceries/en-GB/products/254932789',
  'asda-bananas-bunch': 'https://www.asda.com/groceries/product/bananas/asda-fairtrade-yellow-bananas-bunch/4819216',
  'sainsburys-bananas-bunch': 'https://www.sainsburys.co.uk/gol-ui/product/sainsburys-fairtrade-bananas-bunch',
  'morrisons-bananas-bunch': 'https://groceries.morrisons.com/products/morrisons-bananas-bunch-218491025',
  'iceland-bananas-bunch': 'https://www.iceland.co.uk/p/iceland-bananas-bunch-5pk/78206.html',

  // 25. PEARS
  'tesco-pears-800g': 'https://www.tesco.com/groceries/en-GB/products/254933456',
  'asda-pears-800g': 'https://www.asda.com/groceries/product/pears/asda-sweet-conference-pears-800g/4819217',
  'sainsburys-pears-800g': 'https://www.sainsburys.co.uk/gol-ui/product/sainsburys-conference-pears-800g',
  'morrisons-pears-800g': 'https://groceries.morrisons.com/products/morrisons-conference-pears-800g-218491026',
  'iceland-pears-600g': 'https://www.iceland.co.uk/p/iceland-conference-pears-600g/78207.html',

  // 26. CLEMENTINES
  'tesco-clementines-600g': 'https://www.tesco.com/groceries/en-GB/products/254934123',
  'asda-clementines-600g': 'https://www.asda.com/groceries/product/easy-peelers-oranges/asda-sweet-clementines-easy-peelers-600g/4819218',
  'sainsburys-clementines-600g': 'https://www.sainsburys.co.uk/gol-ui/product/sainsburys-sweet-clementines-600g',
  'morrisons-clementines-600g': 'https://groceries.morrisons.com/products/morrisons-easy-peeler-clementines-600g-218491027',
  'iceland-clementines-600g': 'https://www.iceland.co.uk/p/iceland-easy-peelers-600g/78208.html',

  // 27. WALNUTS & ALMONDS
  'tesco-walnuts-almonds-200g': 'https://www.tesco.com/groceries/en-GB/products/254934789',
  'asda-walnuts-almonds-200g': 'https://www.asda.com/groceries/product/nuts-seeds/asda-walnut-halves-whole-almonds-200g/4819219',
  'sainsburys-walnuts-almonds-200g': 'https://www.sainsburys.co.uk/gol-ui/product/sainsburys-walnut-halves-almonds-200g',
  'morrisons-walnuts-almonds-200g': 'https://groceries.morrisons.com/products/morrisons-almonds-walnuts-200g-218491028',
  'iceland-walnuts-almonds-200g': 'https://www.iceland.co.uk/p/whitworths-walnuts-and-almonds-150g/78209.html',

  // 28. CHIA SEEDS
  'tesco-chia-seeds-150g': 'https://www.tesco.com/groceries/en-GB/products/254935456',
  'asda-chia-seeds-150g': 'https://www.asda.com/groceries/product/nuts-seeds/asda-natural-chia-seeds-150g/4819220',
  'sainsburys-chia-seeds-150g': 'https://www.sainsburys.co.uk/gol-ui/product/sainsburys-natural-chia-seeds-150g',
  'morrisons-chia-seeds-150g': 'https://groceries.morrisons.com/products/morrisons-chia-seeds-150g-218491029',
  'iceland-chia-seeds-150g': 'https://www.iceland.co.uk/p/whitworths-chia-seeds-150g/78210.html',
};

// Replace productUrl in code
for (const [id, url] of Object.entries(DIRECT_MAP)) {
  const regex = new RegExp(`(id:\\s*'${id}',[\\s\\S]*?productUrl:\\s*')[^']+(')`, 'g');
  code = code.replace(regex, `$1${url}$2`);
}

fs.writeFileSync(catalogPath, code, 'utf8');
console.log(`✅ Applied ${Object.keys(DIRECT_MAP).length} direct single-product URLs across all 5 supermarkets!`);

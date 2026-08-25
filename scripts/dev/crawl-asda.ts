import { chromium } from 'playwright';

const items = [
  'ASDA 15 Free Range Medium Eggs',
  'ASDA Fat Free Authentic Greek Yogurt',
  'ASDA Green Brown Lentils in Water',
  'ASDA Semi Skimmed Milk 2 Pints',
  'ASDA Whole Wheat Fusilli',
  'ASDA Baby New Potatoes',
  'ASDA Scottish Rolled Porridge Oats',
  'ASDA Wholemeal Medium Sliced Bread',
  'Mutti Polpa Finely Chopped Tomatoes',
  'ASDA Double Concentrated Tomato Puree',
  'ASDA Extra Virgin Olive Oil',
  'ASDA Courgettes',
  'ASDA Mixed Peppers',
  'ASDA Closed Cup Mushrooms',
  'ASDA Sweet Baby Plum Tomatoes',
  'ASDA Crisp Carrots',
  'ASDA Celery',
  'ASDA Brown Onions',
  'ASDA Red Onions',
  'ASDA Garlic Bulbs',
  'ASDA Fresh Baby Spinach',
  'ASDA Bananas',
  'ASDA Conference Pears',
  'ASDA Clementines Easy Peelers',
  'ASDA Walnuts Almonds',
  'ASDA Chia Seeds',
  'ASDA Frozen Cod Fillets',
];

async function crawlAsdaLiveUrls() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    locale: 'en-GB',
  });
  const page = await context.newPage();

  console.log('Crawling live Asda URLs...\n');

  for (const item of items) {
    const searchUrl = `https://www.asda.com/groceries/search/${encodeURIComponent(item)}`;
    try {
      await page.goto(searchUrl, { timeout: 15000, waitUntil: 'domcontentloaded' }).catch(() => null);
      await page.waitForTimeout(2500);

      const link = await page.evaluate(() => {
        const anchors = Array.from(document.querySelectorAll('a[href*="/product/"]'));
        for (const a of anchors) {
          const href = (a as HTMLAnchorElement).href;
          const text = (a as HTMLElement).innerText?.trim();
          if (href && text && !href.includes('/search')) {
            return { title: text.replace(/\n+/g, ' '), url: href };
          }
        }
        return null;
      });

      if (link) {
        console.log(`✓ "${item}" -> Title: "${link.title}" -> ${link.url}`);
      } else {
        console.log(`⚠️ "${item}" -> No direct anchor, use search: ${searchUrl}`);
      }
    } catch (e: any) {
      console.log(`Error on "${item}": ${e.message}`);
    }
  }

  await browser.close();
}

crawlAsdaLiveUrls();

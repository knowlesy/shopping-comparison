/**
 * Store Info Metadata
 */
export const SUPERMARKETS_INFO = {
  asda: {
    id: 'asda',
    name: 'ASDA',
    shortName: 'Asda',
    logo: '🟢',
    themeColor: '#78be20',
    accentColor: '#5c9417',
    deliveryMinOrder: 40,
    deliveryFee: 3.5,
    deliveryPassAvailable: true,
    searchBaseUrl: 'https://www.asda.com/groceries/search/'
  },
  tesco: {
    id: 'tesco',
    name: 'Tesco',
    shortName: 'Tesco',
    logo: '🔴',
    themeColor: '#ee1c2e',
    accentColor: '#00539f',
    deliveryMinOrder: 50,
    deliveryFee: 4.5,
    deliveryPassAvailable: true,
    searchBaseUrl: 'https://www.tesco.com/groceries/en-GB/search?query='
  },
  sainsburys: {
    id: 'sainsburys',
    name: "Sainsbury's",
    shortName: 'Sainsburys',
    logo: '🟠',
    themeColor: '#e05a00',
    accentColor: '#bf4c00',
    deliveryMinOrder: 40,
    deliveryFee: 4.0,
    deliveryPassAvailable: true,
    searchBaseUrl: 'https://www.sainsburys.co.uk/gol-ui/SearchResults/'
  },
  morrisons: {
    id: 'morrisons',
    name: 'Morrisons',
    shortName: 'Morrisons',
    logo: '🟡',
    themeColor: '#ffbb00',
    accentColor: '#004a2f',
    deliveryMinOrder: 40,
    deliveryFee: 3.5,
    deliveryPassAvailable: true,
    searchBaseUrl: 'https://groceries.morrisons.com/search?entry='
  },
  iceland: {
    id: 'iceland',
    name: 'Iceland',
    shortName: 'Iceland',
    logo: '🔴',
    themeColor: '#e31837',
    accentColor: '#b3122a',
    deliveryMinOrder: 40,
    deliveryFee: 0.0,
    deliveryPassAvailable: false,
    searchBaseUrl: 'https://www.iceland.co.uk/search?q='
  },
  waitrose: {
    id: 'waitrose',
    name: 'Waitrose',
    shortName: 'Waitrose',
    logo: '🟢',
    themeColor: '#4f7942',
    accentColor: '#2b5120',
    deliveryMinOrder: 40,
    deliveryFee: 3.5,
    deliveryPassAvailable: true,
    searchBaseUrl: 'https://www.waitrose.com/ecom/shop/search?&searchTerm='
  },
  ocado: {
    id: 'ocado',
    name: 'Ocado (M&S)',
    shortName: 'Ocado',
    logo: '🟣',
    themeColor: '#5a2d82',
    accentColor: '#3d1c59',
    deliveryMinOrder: 40,
    deliveryFee: 3.99,
    deliveryPassAvailable: true,
    searchBaseUrl: 'https://www.ocado.com/search?entry='
  },
  coop: {
    id: 'coop',
    name: 'Co-op',
    shortName: 'Co-op',
    logo: '🔵',
    themeColor: '#00a3e0',
    accentColor: '#007ba8',
    deliveryMinOrder: 25,
    deliveryFee: 3.0,
    deliveryPassAvailable: false,
    searchBaseUrl: 'https://www.coop.co.uk/search?q='
  },
  aldi: {
    id: 'aldi',
    name: 'Aldi',
    shortName: 'Aldi',
    logo: '🔷',
    themeColor: '#001e62',
    accentColor: '#e31b23',
    deliveryMinOrder: 0,
    deliveryFee: 0.0,
    deliveryPassAvailable: false,
    searchBaseUrl: 'https://groceries.aldi.co.uk/en-GB/Search?keywords='
  },
  lidl: {
    id: 'lidl',
    name: 'Lidl',
    shortName: 'Lidl',
    logo: '🟡',
    themeColor: '#0050aa',
    accentColor: '#fff000',
    deliveryMinOrder: 0,
    deliveryFee: 0.0,
    deliveryPassAvailable: false,
    searchBaseUrl: 'https://www.lidl.co.uk/search?query='
  }
};

export class BasketCalculator {
  /**
   * Build complete comparison response across all enabled supermarkets
   */
  static computeComparison(
    items,
    storeMatchesMap,
    enabledSupermarkets = ['asda', 'sainsburys', 'tesco', 'morrisons', 'iceland']
  ) {
    const storeResults = {};

    for (const store of enabledSupermarkets) {
      const info = SUPERMARKETS_INFO[store] || {
        id: store,
        name: store.toUpperCase(),
        shortName: store,
        logo: '🛒',
        themeColor: '#333333',
        accentColor: '#555555',
        deliveryMinOrder: 40,
        deliveryFee: 3.5,
        deliveryPassAvailable: false,
        searchBaseUrl: `https://www.google.co.uk/search?q=${store}`
      };

      const matches = storeMatchesMap[store] || [];
      const missingItems = [];
      let subtotal = 0;
      let totalHealthScore = 0;

      for (const m of matches) {
        if (m.product) {
          subtotal += m.totalPrice;
          if (m.product.isHealthier) totalHealthScore += 1;
        } else {
          missingItems.push(m.parsedItem);
        }
      }

      subtotal = Number(subtotal.toFixed(2));
      const deliveryFee = subtotal >= info.deliveryMinOrder ? 0 : info.deliveryFee;
      const totalPrice = Number((subtotal + deliveryFee).toFixed(2));

      storeResults[store] = {
        supermarket: store,
        info,
        items: matches,
        subtotal,
        deliveryFee,
        totalPrice,
        savingsVsHighest: 0,
        itemsFound: items.length - missingItems.length,
        itemsTotal: items.length,
        missingItems,
        isCheapest: false,
        averageHealthScore:
          items.length > 0 ? Math.round((totalHealthScore / items.length) * 100) : 0
      };
    }

    // Rank stores by item coverage first, then lowest total price (stores with 0 items cannot be cheapest)
    const storesWithItems = Object.values(storeResults).filter((s) => s.itemsFound > 0);
    const ranked =
      storesWithItems.length > 0
        ? [...storesWithItems].sort(
            (a, b) => b.itemsFound - a.itemsFound || a.totalPrice - b.totalPrice
          )
        : Object.values(storeResults);

    const cheapestStore = ranked[0]?.supermarket || 'asda';
    const highestStore = ranked[ranked.length - 1]?.supermarket || 'tesco';
    const highestTotal = ranked[ranked.length - 1]?.totalPrice || 0;

    for (const storeRes of Object.values(storeResults)) {
      storeRes.isCheapest = storeRes.itemsFound > 0 && storeRes.supermarket === cheapestStore;
      storeRes.savingsVsHighest =
        storeRes.itemsFound > 0
          ? Math.max(0, Number((highestTotal - storeRes.totalPrice).toFixed(2)))
          : 0;
      if (storeRes.isCheapest) {
        storeRes.badge = '🏆 Cheapest Overall';
      }
    }

    const splitOptimization = this.calculateSplitBasket(items, storeResults, cheapestStore);

    return {
      parsedItems: items,
      supermarkets: storeResults,
      cheapestStore,
      highestStore,
      splitOptimization,
      timestamp: new Date().toISOString()
    };
  }

  static calculateSplitBasket(items, storeResults, cheapestSingleStore) {
    const storeSubtotals = {
      tesco: { items: [], subtotal: 0 },
      asda: { items: [], subtotal: 0 },
      sainsburys: { items: [], subtotal: 0 },
      morrisons: { items: [], subtotal: 0 },
      iceland: { items: [], subtotal: 0 }
    };

    for (let i = 0; i < items.length; i++) {
      let lowestItemPrice = Infinity;
      let bestStoreForThisItem = null;
      let bestMatch = null;

      for (const [storeKey, storeResult] of Object.entries(storeResults)) {
        const match = storeResult.items[i];
        if (match && match.product && match.totalPrice < lowestItemPrice) {
          lowestItemPrice = match.totalPrice;
          bestStoreForThisItem = storeKey;
          bestMatch = match;
        }
      }

      if (bestStoreForThisItem && bestMatch) {
        if (!storeSubtotals[bestStoreForThisItem]) {
          storeSubtotals[bestStoreForThisItem] = { items: [], subtotal: 0 };
        }
        storeSubtotals[bestStoreForThisItem].items.push(bestMatch);
        storeSubtotals[bestStoreForThisItem].subtotal += bestMatch.totalPrice;
      }
    }

    const activeStores = Object.entries(storeSubtotals)
      .filter(([_, data]) => data.items.length > 0)
      .map(([storeKey, data]) => ({
        supermarket: storeKey,
        info: SUPERMARKETS_INFO[storeKey],
        items: data.items,
        storeSubtotal: Number(data.subtotal.toFixed(2))
      }))
      .sort((a, b) => b.items.length - a.items.length);

    const combinedTotal = Number(
      activeStores.reduce((sum, s) => sum + s.storeSubtotal, 0).toFixed(2)
    );
    const singleBestTotal = storeResults[cheapestSingleStore]?.totalPrice || combinedTotal;
    const savingsVsSingleBest = Math.max(0, Number((singleBestTotal - combinedTotal).toFixed(2)));

    const topStoreNames = activeStores
      .slice(0, 2)
      .map((s) => s.info?.name || s.supermarket)
      .join(' & ');
    const explanation =
      activeStores.length > 1
        ? `Splitting your shop between ${topStoreNames} saves an extra £${savingsVsSingleBest.toFixed(2)} compared to single-store checkout at ${SUPERMARKETS_INFO[cheapestSingleStore]?.name || 'Cheapest Store'}.`
        : `Single-store checkout at ${SUPERMARKETS_INFO[cheapestSingleStore]?.name || 'Cheapest Store'} already delivers the best price.`;

    return {
      stores: activeStores,
      combinedTotal,
      savingsVsSingleBest,
      cheapestSingleStoreName: SUPERMARKETS_INFO[cheapestSingleStore]?.name || 'Cheapest Store',
      explanation
    };
  }
}

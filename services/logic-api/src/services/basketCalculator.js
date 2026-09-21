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
      let estimatedMatches = 0;

      for (const m of matches) {
        if (m.product) {
          subtotal += m.totalPrice;
          if (m.product.isHealthier) totalHealthScore += 1;
          if (m.isEstimated || m.confidenceSource === 'catalog') {
            estimatedMatches += 1;
          }
        } else {
          missingItems.push(m.parsedItem);
        }
      }

      subtotal = Number(subtotal.toFixed(2));
      const deliveryFee = subtotal >= info.deliveryMinOrder ? 0 : info.deliveryFee;
      const totalPrice = Number((subtotal + deliveryFee).toFixed(2));
      const itemsFound = items.length - missingItems.length;
      const estimatedShare = itemsFound > 0 ? Number((estimatedMatches / itemsFound).toFixed(2)) : 0;
      const hasEstimatedPrices = estimatedMatches > 0;

      storeResults[store] = {
        supermarket: store,
        info,
        items: matches,
        subtotal,
        deliveryFee,
        totalPrice,
        savingsVsHighest: 0,
        itemsFound,
        itemsTotal: items.length,
        missingItems,
        isCheapest: false,
        estimatedShare,
        hasEstimatedPrices,
        averageHealthScore:
          items.length > 0 ? Math.round((totalHealthScore / items.length) * 100) : 0
      };
      storeResults[store].coveredIndices = matches.reduce(
        (indices, match, index) => (match?.product ? [...indices, index] : indices),
        []
      );
    }

    // Rank stores: stores without materially estimated data rank ahead of estimated ones,
    // then by item coverage, then lowest total price (stores with 0 items cannot be cheapest)
    const storesWithItems = Object.values(storeResults).filter((s) => s.itemsFound > 0);
    const ranked =
      storesWithItems.length > 0
        ? [...storesWithItems].sort(
            (a, b) =>
              (a.estimatedShare >= 0.5 ? 1 : 0) - (b.estimatedShare >= 0.5 ? 1 : 0) ||
              b.itemsFound - a.itemsFound ||
              a.totalPrice - b.totalPrice
          )
        : Object.values(storeResults);

    const cheapestStore = ranked[0]?.supermarket || 'asda';

    // "Highest" must mean the dearest comparable basket, not simply the last row of a ranking
    // that sorts estimated stores to the bottom. A store that carries fewer items is cheaper only
    // because goods are missing, so savings are quoted between baskets of equal coverage.
    const bestCoverage = storesWithItems.reduce((max, s) => Math.max(max, s.itemsFound), 0);
    const referenceCoverage = new Set(storeResults[cheapestStore]?.coveredIndices || []);
    const sameCoveredItems = (store) =>
      store.coveredIndices.length === referenceCoverage.size &&
      store.coveredIndices.every((index) => referenceCoverage.has(index));
    const sameCoverageStores = storesWithItems.filter(sameCoveredItems);
    // A lone partial basket has no like-for-like peer, even when another store has the same count.
    const comparableStores = sameCoverageStores.length > 1 ? sameCoverageStores : [];
    const dearestComparable = comparableStores.reduce(
      (worst, s) => (worst === null || s.totalPrice > worst.totalPrice ? s : worst),
      null
    );
    const highestStore =
      dearestComparable?.supermarket || cheapestStore || 'tesco';
    const highestTotal = dearestComparable?.totalPrice || 0;

    let totalMatched = 0;
    let totalEstimated = 0;

    for (const storeRes of Object.values(storeResults)) {
      storeRes.isCheapest = storeRes.itemsFound > 0 && storeRes.supermarket === cheapestStore;
      storeRes.isComparable = comparableStores.includes(storeRes);
      // Only a like-for-like basket may advertise a saving; a partial basket quotes none.
      storeRes.savingsVsHighest = storeRes.isComparable
        ? Math.max(0, Number((highestTotal - storeRes.totalPrice).toFixed(2)))
        : 0;
      if (storeRes.isCheapest) {
        storeRes.badge = storeRes.isComparable
          ? '🏆 Cheapest Overall'
          : '🏆 Best Available Coverage';
      }
      totalMatched += storeRes.itemsFound;
      totalEstimated += Math.round(storeRes.itemsFound * storeRes.estimatedShare);
    }

    const overallEstimatedShare = totalMatched > 0 ? Number((totalEstimated / totalMatched).toFixed(2)) : 0;
    const splitOptimization = this.calculateSplitBasket(items, storeResults, cheapestStore);

    // The recommended store is only "cheapest" when it is genuinely the lowest comparable price.
    // When it wins on coverage or provenance instead, say so rather than implying a price win.
    const recommended = storeResults[cheapestStore];
    const cheapestComparablePrice = comparableStores.length > 0
      ? Math.min(...comparableStores.map((s) => s.totalPrice))
      : null;
    const recommendationBasis =
      recommended && recommended.itemsFound === bestCoverage &&
      cheapestComparablePrice !== null && recommended.totalPrice <= cheapestComparablePrice
        ? 'lowest_comparable_price'
        : 'best_available_coverage';

    return {
      parsedItems: items,
      supermarkets: storeResults,
      cheapestStore,
      highestStore,
      recommendationBasis,
      comparableCoverage: bestCoverage,
      splitOptimization,
      estimatedShare: overallEstimatedShare,
      hasEstimatedPrices: overallEstimatedShare > 0,
      timestamp: new Date().toISOString()
    };
  }

  /**
   * A line counts as verified when its price came from a retailer, not from a catalog benchmark.
   * This is the single provenance policy used for ranking, single-store baselines and split routes.
   */
  static isVerifiedLine(match) {
    if (!match || !match.product) return false;
    if (match.isEstimated === true) return false;
    if (match.confidenceSource === 'catalog') return false;
    if (match.product.source === 'catalog' || match.product.isEstimated === true) return false;
    return true;
  }

  static deliveryFeeFor(store, subtotal) {
    const info = SUPERMARKETS_INFO[store];
    const minOrder = info?.deliveryMinOrder ?? 40;
    const fee = info?.deliveryFee ?? 0;
    return subtotal >= minOrder ? 0 : fee;
  }

  /**
   * Costs one shopping route (one or two stores) over the whole basket.
   *
   * Each item is bought at whichever store in the route offers it most cheaply. Delivery is added
   * per store actually used, against that store's own subtotal and minimum-order threshold — a
   * route is not comparable to a single-store checkout without it. Items no store in the route can
   * supply stay missing; they are never treated as a saving.
   *
   * @returns {{stores: Array, coveredIndices: Set<number>, subtotal: number, deliveryFee: number,
   *            total: number, verified: boolean, estimatedLines: number}}
   */
  static costRoute(items, storeResults, routeStores) {
    // For a pair, delivery thresholds make per-line price greediness incorrect. Exact
    // enumeration is bounded to ordinary baskets; large baskets retain the existing
    // deterministic fallback rather than risking an unbounded 2^n calculation.
    if (routeStores.length === 2 && items.length <= 18) {
      const choices = items.map((_, index) => routeStores.flatMap((store) => {
        const match = storeResults[store]?.items?.[index];
        return match?.product ? [{ store, match, index }] : [];
      }));
      let best = null;
      const evaluate = (selected) => {
        const buckets = new Map(routeStores.map((store) => [store, []]));
        const coveredIndices = new Set();
        let estimatedLines = 0;
        for (const choice of selected) {
          if (!choice) continue;
          buckets.get(choice.store).push(choice.match);
          coveredIndices.add(choice.index);
          if (!this.isVerifiedLine(choice.match)) estimatedLines += 1;
        }
        const stores = [];
        let subtotal = 0;
        let deliveryFee = 0;
        for (const [store, matches] of buckets) {
          if (matches.length === 0) continue;
          const storeSubtotal = Number(matches.reduce((sum, match) => sum + match.totalPrice, 0).toFixed(2));
          const storeDelivery = this.deliveryFeeFor(store, storeSubtotal);
          stores.push({ supermarket: store, info: SUPERMARKETS_INFO[store], items: matches, storeSubtotal, deliveryFee: storeDelivery, storeTotal: Number((storeSubtotal + storeDelivery).toFixed(2)) });
          subtotal += storeSubtotal;
          deliveryFee += storeDelivery;
        }
        stores.sort((a, b) => b.items.length - a.items.length || a.supermarket.localeCompare(b.supermarket));
        return { stores, coveredIndices, subtotal: Number(subtotal.toFixed(2)), deliveryFee: Number(deliveryFee.toFixed(2)), total: Number((subtotal + deliveryFee).toFixed(2)), verified: estimatedLines === 0 && coveredIndices.size > 0, estimatedLines };
      };
      const selected = Array(items.length).fill(null);
      const visit = (index) => {
        if (index === choices.length) {
          const candidate = evaluate(selected);
          if (!best || candidate.total < best.total) best = candidate;
          return;
        }
        if (choices[index].length === 0) return visit(index + 1);
        for (const choice of choices[index]) {
          selected[index] = choice;
          visit(index + 1);
        }
      };
      visit(0);
      return best || evaluate([]);
    }

    const perStore = new Map(routeStores.map((store) => [store, { items: [], subtotal: 0 }]));
    const coveredIndices = new Set();
    let estimatedLines = 0;

    for (let i = 0; i < items.length; i++) {
      let bestStore = null;
      let bestMatch = null;

      for (const store of routeStores) {
        const match = storeResults[store]?.items?.[i];
        if (!match || !match.product) continue;
        if (bestMatch === null || match.totalPrice < bestMatch.totalPrice) {
          bestMatch = match;
          bestStore = store;
        }
      }

      if (!bestStore) continue;
      const bucket = perStore.get(bestStore);
      bucket.items.push(bestMatch);
      bucket.subtotal += bestMatch.totalPrice;
      coveredIndices.add(i);
      if (!this.isVerifiedLine(bestMatch)) estimatedLines += 1;
    }

    const stores = [];
    let subtotal = 0;
    let deliveryFee = 0;
    for (const [store, data] of perStore) {
      if (data.items.length === 0) continue; // a store that supplies nothing is not part of the route
      const storeSubtotal = Number(data.subtotal.toFixed(2));
      const storeDelivery = this.deliveryFeeFor(store, storeSubtotal);
      stores.push({
        supermarket: store,
        info: SUPERMARKETS_INFO[store],
        items: data.items,
        storeSubtotal,
        deliveryFee: storeDelivery,
        storeTotal: Number((storeSubtotal + storeDelivery).toFixed(2))
      });
      subtotal += storeSubtotal;
      deliveryFee += storeDelivery;
    }

    stores.sort((a, b) => b.items.length - a.items.length || a.supermarket.localeCompare(b.supermarket));

    return {
      stores,
      coveredIndices,
      subtotal: Number(subtotal.toFixed(2)),
      deliveryFee: Number(deliveryFee.toFixed(2)),
      total: Number((subtotal + deliveryFee).toFixed(2)),
      verified: estimatedLines === 0 && coveredIndices.size > 0,
      estimatedLines
    };
  }

  /** Costs `route` over exactly `indices`, or null when the route cannot supply all of them. */
  static costRouteOverIndices(storeResults, routeStores, indices) {
    const perStore = new Map(routeStores.map((store) => [store, 0]));
    let estimatedLines = 0;

    for (const i of indices) {
      let bestStore = null;
      let bestPrice = Infinity;
      for (const store of routeStores) {
        const match = storeResults[store]?.items?.[i];
        if (!match || !match.product) continue;
        if (match.totalPrice < bestPrice) {
          bestPrice = match.totalPrice;
          bestStore = store;
        }
      }
      if (!bestStore) return null; // incomparable: this route cannot cover the same basket
      perStore.set(bestStore, perStore.get(bestStore) + bestPrice);
      if (!this.isVerifiedLine(storeResults[bestStore]?.items?.[i])) estimatedLines += 1;
    }

    let total = 0;
    for (const [store, raw] of perStore) {
      if (raw <= 0) continue;
      const storeSubtotal = Number(raw.toFixed(2));
      total += storeSubtotal + this.deliveryFeeFor(store, storeSubtotal);
    }
    return { total: Number(total.toFixed(2)), verified: estimatedLines === 0, estimatedLines };
  }

  /**
   * Enumerates every single-store and two-store route over the stores that matched anything,
   * and recommends the one with the best coverage, then the lowest delivered total.
   *
   * A saving is only advertised when it is like-for-like: the same items, priced at a single-store
   * route, with delivery included on both sides, and with no catalog-estimated line in the
   * recommended route. Anything else is reported as indicative and labelled.
   */
  static calculateSplitBasket(items, storeResults, cheapestSingleStore) {
    const candidateStores = Object.keys(storeResults).filter(
      (store) => (storeResults[store]?.items || []).some((m) => m && m.product)
    );

    const routes = [];
    for (let a = 0; a < candidateStores.length; a++) {
      routes.push([candidateStores[a]]);
      for (let b = a + 1; b < candidateStores.length; b++) {
        routes.push([candidateStores[a], candidateStores[b]]); // at most two stores, by design
      }
    }

    const costed = routes
      .map((route) => this.costRoute(items, storeResults, route))
      .filter((r) => r.coveredIndices.size > 0);

    if (costed.length === 0) {
      return {
        stores: [],
        combinedTotal: 0,
        combinedSubtotal: 0,
        combinedDeliveryFee: 0,
        savingsVsSingleBest: 0,
        indicativeSavingsVsSingleBest: 0,
        singleBestTotal: 0,
        cheapestSingleStoreName: SUPERMARKETS_INFO[cheapestSingleStore]?.name || 'Cheapest Store',
        itemsCovered: 0,
        itemsTotal: items.length,
        missingItems: [...items],
        provenance: 'none',
        savingsAreVerified: false,
        hasFullCoverage: items.length === 0,
        explanation: 'No supermarket returned a usable price for this basket, so no route can be recommended.'
      };
    }

    // Best coverage first — a cheaper route that simply omits goods must never win.
    const best = costed.reduce((winner, route) => {
      if (route.coveredIndices.size !== winner.coveredIndices.size) {
        return route.coveredIndices.size > winner.coveredIndices.size ? route : winner;
      }
      if (route.total !== winner.total) return route.total < winner.total ? route : winner;
      // Only as a tie-break: an equally covering, equally priced verified route is preferable.
      if (route.verified !== winner.verified) return route.verified ? route : winner;
      return route.stores.length <= winner.stores.length ? route : winner; // prefer one trip
    });

    // Like-for-like single-store baseline: the same items, at one store, delivery included.
    let singleBestTotal = null;
    let singleBestStore = null;
    let baselineVerified = false;
    for (const store of candidateStores) {
      const cost = this.costRouteOverIndices(storeResults, [store], best.coveredIndices);
      if (cost === null) continue;
      if (singleBestTotal === null || cost.total < singleBestTotal) {
        singleBestTotal = cost.total;
        singleBestStore = store;
        baselineVerified = cost.verified;
      }
    }

    const isSplit = best.stores.length > 1;
    const rawSaving =
      singleBestTotal === null ? 0 : Number((singleBestTotal - best.total).toFixed(2));
    const realSaving = isSplit && rawSaving > 0 ? rawSaving : 0;

    const provenance =
      best.estimatedLines === 0
        ? 'verified'
        : (best.estimatedLines === best.coveredIndices.size ? 'estimated' : 'mixed');
    const savingsAreVerified = provenance === 'verified' && baselineVerified && realSaving > 0;

    const missingItems = items.filter((_, i) => !best.coveredIndices.has(i));
    const hasFullCoverage = missingItems.length === 0;
    const baselineName =
      SUPERMARKETS_INFO[singleBestStore || cheapestSingleStore]?.name ||
      singleBestStore || cheapestSingleStore || 'Cheapest Store';
    const routeNames = best.stores.map((s) => s.info?.name || s.supermarket).join(' & ');

    const parts = [];
    if (!isSplit) {
      parts.push(`Single-store checkout at ${routeNames} is the best route for this basket, delivery included.`);
    } else if (savingsAreVerified) {
      parts.push(
        `Splitting your shop between ${routeNames} saves £${realSaving.toFixed(2)} on the same ${best.coveredIndices.size} items compared with buying them all at ${baselineName}, delivery included on both routes.`
      );
    } else if (rawSaving > 0) {
      parts.push(
        `Splitting between ${routeNames} looks about £${rawSaving.toFixed(2)} cheaper than ${baselineName} on the same ${best.coveredIndices.size} items, but ${provenance === 'verified' ? 'the comparison baseline uses estimated catalog prices' : 'the route uses estimated catalog prices'}, so treat it as indicative rather than a confirmed saving.`
      );
    } else {
      parts.push(
        `Splitting between ${routeNames} covers the most items, but once delivery is included it is not cheaper than ${baselineName}, so no saving is claimed.`
      );
    }
    if (!hasFullCoverage) {
      parts.push(
        `${missingItems.length} of ${items.length} item${items.length === 1 ? '' : 's'} could not be priced at any store and ${missingItems.length === 1 ? 'is' : 'are'} not included in these totals.`
      );
    } else if (provenance === 'estimated') {
      parts.push('Every line in this route is an estimated catalog price, not a checked retailer price.');
    }

    return {
      stores: best.stores,
      combinedTotal: best.total,
      combinedSubtotal: best.subtotal,
      combinedDeliveryFee: best.deliveryFee,
      savingsVsSingleBest: savingsAreVerified ? realSaving : 0,
      indicativeSavingsVsSingleBest: Math.max(0, rawSaving),
      singleBestTotal: singleBestTotal ?? 0,
      cheapestSingleStoreName: baselineName,
      itemsCovered: best.coveredIndices.size,
      itemsTotal: items.length,
      missingItems,
      provenance,
      savingsAreVerified,
      hasFullCoverage,
      explanation: parts.join(' ')
    };
  }
}

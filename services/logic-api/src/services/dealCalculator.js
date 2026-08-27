/**
 * Deal & Multibuy Pricing Calculation Engine
 *
 * Accurately parses UK supermarket promotional structures and computes
 * optimized basket totals across edge quantities (under-quantity, exact quantity, remainder quantity).
 */

export class DealCalculator {
  /**
   * Parse promotional string into structured deal object
   * @param {string} dealStr - Scraped promotional text (e.g. "3 for £2", "Buy 2 Get 1 Free", "Save £1 on 2", "£1.50 Clubcard Price")
   * @returns {object|null} Structured deal or null if unrecognizable
   */
  static parseDeal(dealStr) {
    if (!dealStr || typeof dealStr !== 'string') return null;
    const clean = dealStr.trim();
    if (!clean) return null;

    // 1. Multibuy Fixed Price: "3 for £2", "Any 3 for £2.00", "Buy 2 for £3"
    const multibuyMatch = clean.match(/(?:any\s+|buy\s+)?(\d+)\s+for\s+£([\d.]+)/i);
    if (multibuyMatch) {
      const bundleQuantity = parseInt(multibuyMatch[1], 10);
      const bundlePrice = parseFloat(multibuyMatch[2]);
      if (bundleQuantity > 1 && bundlePrice > 0) {
        return {
          rawText: clean,
          type: 'multibuy_fixed',
          bundleQuantity,
          bundlePrice,
          badge: `${bundleQuantity} for £${bundlePrice.toFixed(2).replace(/\.00$/, '')}`
        };
      }
    }

    // 2. Buy X Get Y Free / BOGOF: "Buy 2 Get 1 Free", "Buy 1 Get 1 Free", "BOGOF", "Buy 3 for the price of 2"
    const bogofMatch = clean.match(/bogof/i);
    if (bogofMatch) {
      return {
        rawText: clean,
        type: 'buy_x_get_y_free',
        buyQuantity: 1,
        freeQuantity: 1,
        badge: 'Buy 1 Get 1 Free'
      };
    }

    const buyGetFreeMatch = clean.match(/buy\s+(\d+)\s+get\s+(\d+)\s+free/i);
    if (buyGetFreeMatch) {
      const buyQuantity = parseInt(buyGetFreeMatch[1], 10);
      const freeQuantity = parseInt(buyGetFreeMatch[2], 10);
      if (buyQuantity > 0 && freeQuantity > 0) {
        return {
          rawText: clean,
          type: 'buy_x_get_y_free',
          buyQuantity,
          freeQuantity,
          badge: `Buy ${buyQuantity} Get ${freeQuantity} Free`
        };
      }
    }

    const priceOfMatch = clean.match(/buy\s+(\d+)\s+for\s+(?:the\s+)?price\s+of\s+(\d+)/i);
    if (priceOfMatch) {
      const totalItems = parseInt(priceOfMatch[1], 10);
      const payFor = parseInt(priceOfMatch[2], 10);
      if (totalItems > payFor && payFor > 0) {
        return {
          rawText: clean,
          type: 'buy_x_get_y_free',
          buyQuantity: payFor,
          freeQuantity: totalItems - payFor,
          badge: `Buy ${payFor} Get ${totalItems - payFor} Free`
        };
      }
    }

    // 3. Bundle Discount: "Save £1 when you buy 2", "Save 50p on 2", "Save £1.50 on 3"
    const savePoundsMatch = clean.match(/save\s+£([\d.]+)\s+(?:when\s+you\s+buy|on)\s+(\d+)/i);
    if (savePoundsMatch) {
      const discountAmount = parseFloat(savePoundsMatch[1]);
      const bundleQuantity = parseInt(savePoundsMatch[2], 10);
      if (discountAmount > 0 && bundleQuantity > 1) {
        return {
          rawText: clean,
          type: 'bundle_discount',
          bundleQuantity,
          discountAmount,
          badge: `Save £${discountAmount.toFixed(2).replace(/\.00$/, '')} on ${bundleQuantity}`
        };
      }
    }

    const savePenceMatch = clean.match(/save\s+(\d+)p\s+(?:when\s+you\s+buy|on)\s+(\d+)/i);
    if (savePenceMatch) {
      const discountAmount = parseInt(savePenceMatch[1], 10) / 100;
      const bundleQuantity = parseInt(savePenceMatch[2], 10);
      if (discountAmount > 0 && bundleQuantity > 1) {
        return {
          rawText: clean,
          type: 'bundle_discount',
          bundleQuantity,
          discountAmount,
          badge: `Save ${savePenceMatch[1]}p on ${bundleQuantity}`
        };
      }
    }

    // 4. Loyalty Card Pricing: "£1.50 Clubcard Price", "£1.25 Nectar Price", "Price with Nectar £1.25"
    const loyaltyMatch = clean.match(/(?:£([\d.]+)\s+)?(clubcard|nectar|morrisons\s+more|asda\s+rewards|lidl\s+plus)(?:\s+price)?(?:\s+£([\d.]+))?/i);
    if (loyaltyMatch) {
      const priceStr = loyaltyMatch[1] || loyaltyMatch[3];
      const scheme = loyaltyMatch[2].toLowerCase();
      if (priceStr) {
        const loyaltyPrice = parseFloat(priceStr);
        const schemeFormatted = scheme.charAt(0).toUpperCase() + scheme.slice(1);
        return {
          rawText: clean,
          type: 'loyalty_price',
          loyaltyPrice,
          loyaltyScheme: schemeFormatted,
          badge: `£${loyaltyPrice.toFixed(2)} ${schemeFormatted} Price`
        };
      }
    }

    // Fallback: Generic deal description
    return {
      rawText: clean,
      type: 'generic_deal',
      badge: clean
    };
  }

  /**
   * Calculate optimized total price for a given requested quantity based on active deal structures
   * @param {number} singleUnitPrice - Regular single item price (e.g. £0.80)
   * @param {number} quantity - Quantity of packs/items requested (e.g. 3)
   * @param {object|string} dealInput - Structured deal object or raw deal string
   * @returns {{ totalPrice: number, effectiveUnitPrice: number, standardPrice: number, savings: number, isDealApplied: boolean, dealSummary: string|null }}
   */
  static calculateDealPrice(singleUnitPrice, quantity, dealInput) {
    const qty = Math.max(1, Math.round(quantity || 1));
    const basePrice = Number(singleUnitPrice) || 0;
    const standardPrice = Number((qty * basePrice).toFixed(2));

    if (!dealInput || basePrice <= 0) {
      return {
        totalPrice: standardPrice,
        effectiveUnitPrice: basePrice,
        standardPrice,
        savings: 0,
        isDealApplied: false,
        dealSummary: null
      };
    }

    const deal = typeof dealInput === 'string' ? this.parseDeal(dealInput) : dealInput;
    if (!deal) {
      return {
        totalPrice: standardPrice,
        effectiveUnitPrice: basePrice,
        standardPrice,
        savings: 0,
        isDealApplied: false,
        dealSummary: null
      };
    }

    let dealTotalPrice = standardPrice;
    let dealSummary = null;

    switch (deal.type) {
      case 'multibuy_fixed': {
        const { bundleQuantity, bundlePrice } = deal;
        if (bundleQuantity && bundlePrice && bundleQuantity > 1) {
          const numBundles = Math.floor(qty / bundleQuantity);
          const remainder = qty % bundleQuantity;

          if (numBundles > 0) {
            const calculatedTotal = (numBundles * bundlePrice) + (remainder * basePrice);
            // Only apply deal if it actually provides savings
            if (calculatedTotal < standardPrice) {
              dealTotalPrice = calculatedTotal;
              dealSummary = `${numBundles}x (${bundleQuantity} for £${bundlePrice.toFixed(2)})${remainder > 0 ? ` + ${remainder} single(s)` : ''}`;
            }
          }
        }
        break;
      }

      case 'buy_x_get_y_free': {
        const { buyQuantity, freeQuantity } = deal;
        if (buyQuantity && freeQuantity) {
          const cycleSize = buyQuantity + freeQuantity;
          const numCycles = Math.floor(qty / cycleSize);
          const remainder = qty % cycleSize;
          const itemsChargedInRemainder = Math.min(remainder, buyQuantity);

          const totalChargedItems = (numCycles * buyQuantity) + itemsChargedInRemainder;
          const calculatedTotal = totalChargedItems * basePrice;

          if (calculatedTotal < standardPrice) {
            dealTotalPrice = calculatedTotal;
            const freeCount = qty - totalChargedItems;
            dealSummary = `Buy ${buyQuantity} Get ${freeQuantity} Free (${freeCount} free)`;
          }
        }
        break;
      }

      case 'bundle_discount': {
        const { bundleQuantity, discountAmount } = deal;
        if (bundleQuantity && discountAmount && bundleQuantity > 1) {
          const numBundles = Math.floor(qty / bundleQuantity);
          if (numBundles > 0) {
            const totalDiscount = numBundles * discountAmount;
            const calculatedTotal = Math.max(0, standardPrice - totalDiscount);
            if (calculatedTotal < standardPrice) {
              dealTotalPrice = calculatedTotal;
              dealSummary = `Saved £${totalDiscount.toFixed(2)} (${numBundles}x discount)`;
            }
          }
        }
        break;
      }

      case 'loyalty_price': {
        const { loyaltyPrice, loyaltyScheme } = deal;
        if (loyaltyPrice && loyaltyPrice < basePrice) {
          dealTotalPrice = qty * loyaltyPrice;
          dealSummary = `${loyaltyScheme || 'Member'} Price: £${loyaltyPrice.toFixed(2)}/item`;
        }
        break;
      }

      default:
        break;
    }

    const finalTotalPrice = Number(dealTotalPrice.toFixed(2));
    const savings = Number(Math.max(0, standardPrice - finalTotalPrice).toFixed(2));
    const effectiveUnitPrice = Number((finalTotalPrice / qty).toFixed(2));
    const isDealApplied = savings > 0;

    return {
      totalPrice: finalTotalPrice,
      effectiveUnitPrice,
      standardPrice,
      savings,
      isDealApplied,
      dealSummary: isDealApplied ? (dealSummary || deal.badge || deal.rawText) : null
    };
  }
}

async function testLogicApi() {
  const apiUrl = 'http://127.0.0.1:3001';
  console.log(`[Test-Logic] Testing Logic API at: ${apiUrl}\n`);

  // 1. Health Check
  try {
    const healthRes = await fetch(`${apiUrl}/health`);
    const health = await healthRes.json();
    console.log('✅ [Test-Logic] Health Check:', health);
  } catch (e) {
    console.error('❌ [Test-Logic] Health check failed:', e.message);
    return;
  }

  // 2. Parse List
  const rawList = `900g 5% lean beef mince\n2 Pints semi-skimmed milk`;
  console.log('\n--- 1. Testing /api/parse-list ---');
  const parseRes = await fetch(`${apiUrl}/api/parse-list`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ rawText: rawList })
  });
  const parsedData = await parseRes.json();
  console.log('Parsed Items:', parsedData.items.map(i => ({ name: i.name, targetQty: i.targetQuantity, unit: i.unit, fatPct: i.fatPercentage })));

  // 3. Live Compare
  console.log('\n--- 2. Testing /api/compare (Live Scrape + AI/DOM Parsing + Fuzzy Matching) ---');
  const compareRes = await fetch(`${apiUrl}/api/compare`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      items: parsedData.items,
      preferences: {
        healthierDefault: true,
        fatPercentagePreference: 5,
        preferWholewheat: true,
        preferFreeRange: true,
        packSizingPolicy: 'closest',
        enabledSupermarkets: ['asda', 'sainsburys', 'tesco', 'morrisons', 'iceland']
      }
    })
  });

  const compData = await compareRes.json();
  if (compareRes.ok) {
    console.log('\n🏆 COMPARISON RESULT:');
    console.log(`Cheapest Single Store: ${compData.cheapestStore.toUpperCase()}`);
    console.log('\nSTORE TOTALS:');
    for (const [store, res] of Object.entries(compData.supermarkets)) {
      console.log(`- [${store.toUpperCase()}] Subtotal: £${res.subtotal} | Delivery: £${res.deliveryFee} | Total: £${res.totalPrice} | Items Found: ${res.itemsFound}/${res.itemsTotal}`);
      for (const item of res.items) {
        if (item.product) {
          console.log(`    ↳ "${item.product.title}" (${item.product.packageDisplay}) x${item.packsNeeded} = £${item.totalPrice} | Live Link: ${item.product.productUrl}`);
        } else {
          console.log(`    ↳ [MISSING] ${item.parsedItem.name}`);
        }
      }
    }

    if (compData.splitOptimization) {
      console.log('\n💡 SPLIT BASKET OPTIMIZATION:');
      console.log(`Combined Total: £${compData.splitOptimization.combinedTotal}`);
      console.log(`Savings vs Single Best: £${compData.splitOptimization.savingsVsSingleBest}`);
      console.log(`Explanation: ${compData.splitOptimization.explanation}`);
    }
  } else {
    console.error('❌ Comparison failed:', compData);
  }
}

testLogicApi();

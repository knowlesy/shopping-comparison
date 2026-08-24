async function testLiveData() {
  console.log('Testing live price endpoints across UK supermarkets...\n');

  // 1. Test Asda Search API
  try {
    const asdaRes = await fetch('https://groceries.asda.com/api/items/search?keyword=beef+mince', {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Accept': 'application/json',
        'request-origin': 'gi',
      }
    });
    console.log(`Asda API Status: ${asdaRes.status}`);
    if (asdaRes.ok) {
      const data: any = await asdaRes.json();
      console.log('Asda response keys:', Object.keys(data));
      const items = data?.items || data?.itemResult?.items || [];
      console.log(`Asda returned ${items.length} items.`);
    }
  } catch (e: any) {
    console.log(`Asda API error: ${e.message}`);
  }

  // 2. Test Iceland Search API
  try {
    const icelandRes = await fetch('https://www.iceland.co.uk/api/search?q=beef+mince', {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Accept': 'application/json',
      }
    });
    console.log(`Iceland API Status: ${icelandRes.status}`);
  } catch (e: any) {
    console.log(`Iceland API error: ${e.message}`);
  }
}

testLiveData();

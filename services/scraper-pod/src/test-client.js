// Node 18+ has native global fetch

async function runTest() {
  const targetUrl = process.argv[2] || 'https://www.trolley.co.uk/search/?q=beef+mince';
  const scraperApiUrl = process.env.SCRAPER_API_URL || 'http://localhost:3002/scrape';

  console.log(`[Test-Client] Sending scrape request to: ${scraperApiUrl}`);
  console.log(`[Test-Client] Target website URL:     ${targetUrl}\n`);

  try {
    const response = await fetch(scraperApiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        url: targetUrl,
        waitForSelector: 'body',
        timeout: 35000,
        delay: 2500
      })
    });

    const data = await response.json();

    if (response.ok && data.success) {
      console.log('✅ [Test-Client] Scrape SUCCESSFUL!');
      console.log(`   Status:       ${response.status}`);
      console.log(`   Page Title:   "${data.title}"`);
      console.log(`   Final URL:    ${data.finalUrl}`);
      console.log(`   HTML Length:  ${data.length} characters`);
      console.log(`   Elapsed Time: ${data.elapsedMs}ms`);
      console.log('\n📄 [HTML Body Snippet (First 500 chars)]:');
      console.log('----------------------------------------------------');
      console.log(data.body ? data.body.substring(0, 500) + '...' : 'No body content');
      console.log('----------------------------------------------------');
    } else {
      console.error('❌ [Test-Client] Scrape FAILED:');
      console.error(JSON.stringify(data, null, 2));
    }
  } catch (err) {
    console.error('❌ [Test-Client] Connection error:', err.message);
    console.error('   Make sure the Scraper Pod server is running on http://localhost:3002');
  }
}

runTest();

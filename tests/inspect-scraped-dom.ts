async function inspectFullCardPrices() {
  const res = await fetch('http://localhost:3002/scrape', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url: 'https://www.trolley.co.uk/search/?q=beef+mince' })
  });
  const data = await res.json();
  const html = data.html;

  const start = html.indexOf('<div class="product-item');
  if (start !== -1) {
    console.log(html.substring(start, start + 2500));
  }
}

inspectFullCardPrices();

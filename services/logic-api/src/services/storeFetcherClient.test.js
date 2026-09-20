import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';

/**
 * The sidecar cannot see our AbortSignal: aborting the fetch here does not stop it
 * working through the remaining retailers. The client must therefore declare its own
 * budget in the request body so the sidecar adopts the same deadline.
 */
describe('StoreFetcherClient request budget contract', () => {
  let server;
  let received;
  let StoreFetcherClient;

  before(async () => {
    received = [];
    server = http.createServer((req, res) => {
      let body = '';
      req.on('data', (chunk) => {
        body += chunk;
      });
      req.on('end', () => {
        received.push({ url: req.url, body: JSON.parse(body || '{}') });
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(
          JSON.stringify({
            query: 'milk',
            stores: { tesco: { status: 'ok', products: [{ id: 't1', title: 'Milk', price: 1.1 }] } },
            source: 'direct',
            deadline: { budgetMs: 4321, elapsedMs: 5, acceptingNewWork: true, exceeded: false }
          })
        );
      });
    });

    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    process.env.STORE_FETCHER_URL = `http://127.0.0.1:${server.address().port}`;

    // Imported after the URL is set: the client reads it at module load.
    ({ StoreFetcherClient } = await import('./storeFetcherClient.js'));
  });

  after(async () => {
    if (server) await new Promise((resolve) => server.close(resolve));
  });

  it('declares its timeout budget to the sidecar', async () => {
    const res = await StoreFetcherClient.search('milk', ['tesco'], { timeoutMs: 4321 });

    assert.equal(res.success, true);
    assert.equal(received.length, 1);
    assert.equal(received[0].url, '/search');
    assert.equal(
      received[0].body.timeoutMs,
      4321,
      'the sidecar must be told the budget, or its work can outlive this caller'
    );
    assert.equal(received[0].body.query, 'milk');
    assert.deepEqual(received[0].body.stores, ['tesco']);
  });

  it('sends the default budget when the caller does not specify one', async () => {
    received.length = 0;
    await StoreFetcherClient.search('bread', ['tesco']);

    assert.equal(received.length, 1);
    assert.equal(typeof received[0].body.timeoutMs, 'number');
    assert.ok(received[0].body.timeoutMs > 0);
  });

  it('still returns normalised products alongside the per-store statuses', async () => {
    received.length = 0;
    const res = await StoreFetcherClient.search('milk', ['tesco'], { timeoutMs: 4321 });

    assert.equal(res.products.length, 1);
    assert.equal(res.products[0].supermarket, 'tesco');
    assert.equal(res.products[0].source, 'direct');
    assert.equal(res.stores.tesco.status, 'ok');
  });
});

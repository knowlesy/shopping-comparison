import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

test('offline harness blocks external fetch even with a dummy model key', () => {
  const preload = fileURLToPath(new URL('../../../../tests/support/isolated-env.mjs', import.meta.url));
  const result = spawnSync(process.execPath, ['--import', preload, '--input-type=module', '-e', `
    import assert from 'node:assert/strict';
    process.env.GEMINI_API_KEY = 'invalid-test-key';
    await assert.rejects(fetch('https://example.invalid'), /TEST_NETWORK_BLOCKED/);
    assert.ok(process.env.DATA_DIR.includes('shopping-offline-test-'));
  `], { encoding: 'utf8', timeout: 5000 });
  assert.equal(result.status, 0, result.stderr);
});

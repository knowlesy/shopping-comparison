import { defineConfig, devices } from '@playwright/test';

/**
 * Integration tests run against a real, isolated Logic-API (tests/support/test-api-server.js)
 * and the built client served by `vite preview`, which proxies /api to that API.
 *
 * Ports are dedicated to the test run so an unrelated dev server (3001/5173) is never reused.
 * Set TEST_API_DISABLED=1 to run the controlled negative case with no API behind the proxy.
 */
const API_PORT = Number(process.env.TEST_API_PORT || 3101);
const CLIENT_PORT = Number(process.env.TEST_CLIENT_PORT || 4180);
const API_DISABLED = process.env.TEST_API_DISABLED === '1';

const API_URL = `http://127.0.0.1:${API_PORT}`;
const CLIENT_URL = `http://127.0.0.1:${CLIENT_PORT}`;

const apiServer = {
  command: 'node tests/support/test-api-server.js',
  url: `${API_URL}/health`,
  reuseExistingServer: false,
  timeout: 60_000,
  stdout: 'pipe' as const,
  stderr: 'pipe' as const,
  env: {
    TEST_API_PORT: String(API_PORT),
    TEST_CLIENT_PORT: String(CLIENT_PORT),
  },
};

const clientServer = {
  command: `npm --prefix client run preview -- --port ${CLIENT_PORT} --strictPort`,
  url: CLIENT_URL,
  reuseExistingServer: false,
  timeout: 120_000,
  env: {
    API_PROXY_TARGET: API_URL,
  },
};

export default defineConfig({
  testDir: './tests',
  timeout: 90000,
  expect: {
    timeout: 5000,
  },
  fullyParallel: false,
  retries: 0,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: CLIENT_URL,
    trace: 'on-first-retry',
    headless: true,
  },
  projects: [
    {
      // Requires the API: a browser-side fallback cannot satisfy these assertions.
      name: 'api-integration',
      testMatch: /.*\.api\.spec\.ts/,
      use: { ...devices['Desktop Chrome'] },
    },
    {
      // UI flow coverage only. It deliberately tolerates an unavailable API and
      // therefore proves nothing about server integration — see api-integration.
      name: 'ui-offline',
      testMatch: /app-flow\.spec\.ts/,
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: API_DISABLED ? [clientServer] : [apiServer, clientServer],
});

import { defineConfig, devices } from '@playwright/test';

const allBrowsers = process.env.PLAYWRIGHT_ALL_BROWSERS === '1';
const chaosMode = process.env.CHESS_CHAOS === '1';
const stagingLiveSpec = '**/staging-live.spec.js';

export default defineConfig({
  testDir: '.',
  testIgnore: chaosMode
    ? [stagingLiveSpec]
    : ['**/chaos-local.spec.js', stagingLiveSpec],
  reporter: process.env.CI ? [['list']] : [['line']],
  timeout: 20_000,
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: 0,
  expect: { timeout: 4_000 },
  workers: process.env.CI ? 2 : undefined,
  projects: allBrowsers ? [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
    { name: 'webkit', use: { ...devices['Desktop Safari'] } },
  ] : [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
  use: {
    baseURL: 'http://127.0.0.1:4173/chess-studio/',
    // Los journeys E2E mockean red con page.route(). Un Service Worker activo
    // puede interceptar esas peticiones antes que Playwright y volver invisibles
    // mocks como release.json. Las pruebas específicas de PWA deben vivir en una
    // suite separada con serviceWorkers habilitado.
    serviceWorkers: 'block',
    actionTimeout: 5_000,
    navigationTimeout: 10_000,
    headless: true,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  webServer: {
    command: 'npm --prefix ../frontend run preview -- --host 127.0.0.1 --port 4173',
    url: 'http://127.0.0.1:4173/chess-studio/',
    reuseExistingServer: !process.env.CI,
    timeout: 20_000,
  },
});

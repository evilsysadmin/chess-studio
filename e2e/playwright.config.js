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
  // 3D is now the product default, so a single CI file must not fan out into
  // several simultaneous headless WebGL contexts. Files can still run in
  // parallel (the configured CI worker budget remains 2), while tests inside
  // each file stay sequential and stop starving Chromium's main thread.
  fullyParallel: !process.env.CI,
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
    // Switching 2D↔3D remounts WebGL while the settings control is still
    // settling. The dedicated War Room helpers already budget 12 s for the
    // opening action; use the same ceiling for the close/actionability phase.
    // Subsequent renderer assertions still fail if the interaction did not land.
    actionTimeout: 12_000,
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

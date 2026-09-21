import { defineConfig, devices } from '@playwright/test';

const allBrowsers = process.env.PLAYWRIGHT_ALL_BROWSERS === '1';
const fullSweep = process.env.PLAYWRIGHT_FULL_SWEEP === '1';
const chaosMode = process.env.CHESS_CHAOS === '1';
const ciMode = Boolean(process.env.CI);
const visualArtifactMode = Boolean(
  process.env.APP_VISUAL_ARTIFACT || process.env.APP_VISUAL_EXPERIMENTS_SCOPE,
);
const stagingLiveSpec = '**/staging-live.spec.js';
const testIgnore = chaosMode
  ? [stagingLiveSpec]
  : ['**/chaos-local.spec.js', stagingLiveSpec];
if (fullSweep) {
  // Artifact producers already have scoped Chromium capture workflows. Replaying
  // screenshot/video generation in Chromium + Firefox + WebKit adds runner cost
  // without exercising a distinct functional compatibility contract.
  testIgnore.push('**/regression-journeys.spec.js', '**/*-visual-artifact.spec.js');
}

export default defineConfig({
  testDir: '.',
  testMatch: fullSweep ? ['**/*.spec.js', '**/regression-journeys-core.js'] : undefined,
  testIgnore,
  reporter: ciMode ? [['list']] : [['line']],
  // Production/staging now enter Three/WebGL by default. Hosted CI has no GPU
  // budget comparable to a developer browser, so give *CI only* enough time to
  // mount/reload the real renderer while keeping the tighter local feedback loop.
  timeout: ciMode ? 45_000 : 20_000,
  fullyParallel: true,
  forbidOnly: ciMode,
  retries: 0,
  // Cold/restored War Room mounts are consistently >10 s on hosted software
  // rendering while staying well below 20 s. Keep local assertions sharp; CI
  // gets the measured renderer budget instead of treating a slow GPU-less mount
  // as a product failure.
  expect: { timeout: ciMode ? 20_000 : 4_000 },
  workers: ciMode ? 2 : undefined,
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
    // The visual artifact producer gets a larger ceiling because full-page
    // WebGL screenshots can exceed 12 s on hosted software rendering. Functional
    // CI keeps the tighter interaction budget.
    actionTimeout: visualArtifactMode ? 30_000 : 12_000,
    navigationTimeout: ciMode ? 20_000 : 10_000,
    headless: true,
    // Canonical visual producers already emit purpose-built screenshots. Video
    // encoding is especially expensive for software-rendered WebGL and Playwright
    // records it even for green tests before deleting retain-on-failure captures.
    // Keep trace + failure screenshots for functional diagnosis, but never encode
    // per-test video in CI/local browser gates.
    trace: visualArtifactMode ? 'off' : 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'off',
  },
  webServer: {
    command: 'python3 -S ../scripts/e2e_dist_server.py --root ../frontend/dist --base /chess-studio/ --host 127.0.0.1 --port 4173',
    url: 'http://127.0.0.1:4173/chess-studio/',
    reuseExistingServer: !ciMode,
    timeout: 20_000,
  },
});

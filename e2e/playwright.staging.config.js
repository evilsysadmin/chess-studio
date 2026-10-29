import { defineConfig, devices } from '@playwright/test';

const baseURL = process.env.STAGING_URL || 'https://staging.chess-studio.shadowops.dpdns.org';
// Opt-in local A/B comparison only. CI's canonical staging run remains exactly
// as before, with Playwright's default software/headless renderer.
const rendererMode = process.env.CHESS_STAGING_RENDERER || 'default';
if (!['default', 'software', 'hardware'].includes(rendererMode)) {
  throw new Error('CHESS_STAGING_RENDERER debe ser default, software o hardware');
}
const rendererArgs = rendererMode === 'hardware'
  ? ['--use-angle=gl', '--use-gl=angle', '--ignore-gpu-blocklist', '--enable-gpu-rasterization']
  : rendererMode === 'software'
    ? ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader']
    : [];

export default defineConfig({
  testDir: '.',
  testMatch: ['staging-live.spec.js', 'staging-war-room-restore.spec.js', 'staging-pawn-slug-godot.spec.js'],
  reporter: [['list']],
  timeout: 90_000,
  fullyParallel: false,
  forbidOnly: true,
  retries: 0,
  expect: { timeout: 15_000 },
  workers: 1,
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
  use: {
    baseURL,
    ...(rendererArgs.length ? { launchOptions: { args: rendererArgs } } : {}),
    serviceWorkers: 'block',
    actionTimeout: 15_000,
    navigationTimeout: 30_000,
    headless: true,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    // Staging is our product-acceptance environment. Keep the short smoke video
    // even when green so we can inspect the real deployed War Room instead of
    // inferring visual quality from DOM/WebGL contract tests alone.
    video: 'on',
  },
});

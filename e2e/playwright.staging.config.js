import { defineConfig, devices } from '@playwright/test';

const baseURL = process.env.STAGING_URL || 'https://staging.chess-studio.shadowops.dpdns.org';

export default defineConfig({
  testDir: '.',
  testMatch: ['staging-live.spec.js'],
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
    serviceWorkers: 'block',
    actionTimeout: 15_000,
    navigationTimeout: 30_000,
    headless: true,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
});

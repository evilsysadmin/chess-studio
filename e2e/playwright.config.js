import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: '.',
  reporter: process.env.CI ? [['list']] : [['line']],
  timeout: 20_000,
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: 0,
  expect: { timeout: 4_000 },
  workers: process.env.CI ? 2 : undefined,
  use: {
    baseURL: 'http://127.0.0.1:4173/chess-studio/',
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

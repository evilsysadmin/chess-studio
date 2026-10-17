import { defineConfig, devices } from '@playwright/test';
import base from './playwright.config.js';

// Strictly local opt-in; never exercise this physical-GPU benchmark in hosted CI.
const mode = process.env.CHESS_HOME_GPU_MODE;
if (!['hardware', 'software'].includes(mode)) {
  throw new Error('CHESS_HOME_GPU_MODE must explicitly be hardware or software');
}
if (process.env.CI) {
  throw new Error('Home physical GPU benchmark must be run locally, never on hosted CI');
}
const args = mode === 'hardware'
  ? ['--use-gl=angle', '--use-angle=gl', '--ignore-gpu-blocklist', '--enable-gpu-rasterization']
  : ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'];

export default defineConfig({
  ...base,
  testMatch: ['home-3d-gpu-benchmark.spec.js'],
  testIgnore: [],
  workers: 1,
  fullyParallel: false,
  retries: 0,
  timeout: 450_000,
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  use: {
    ...base.use,
    reducedMotion: 'no-preference',
    headless: process.env.CHESS_HOME_GPU_HEADLESS === '1',
    launchOptions: { args },
    trace: 'off',
    video: 'off',
    screenshot: 'only-on-failure',
  },
});

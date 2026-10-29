import { defineConfig, devices } from '@playwright/test';
import base from './playwright.config.js';

// Local, explicitly selected physical GPU/SwiftShader comparison only.
const mode = process.env.CHESS_PVP_GPU_MODE;
if (!['hardware', 'software'].includes(mode)) {
  throw new Error('CHESS_PVP_GPU_MODE must explicitly be hardware or software');
}
const args = mode === 'hardware'
  ? ['--use-gl=angle', '--use-angle=gl', '--ignore-gpu-blocklist', '--enable-gpu-rasterization']
  : ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'];

export default defineConfig({
  ...base,
  testMatch: ['pvp-hall-gpu-benchmark.spec.js'],
  testIgnore: [],
  workers: 1, fullyParallel: false, retries: 0, timeout: 90000,
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  use: {
    ...base.use,
    headless: process.env.CHESS_PVP_GPU_HEADLESS === '1',
    launchOptions: { args },
    trace: 'off', video: 'off', screenshot: 'only-on-failure',
  },
});

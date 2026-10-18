import { expect, test } from '@playwright/test';
import { mockApi, waitForHomeInteractive } from './helpers.js';

// Lightweight software/CI regression for the exact session-restoration route
// used by the local GPU A/B harness. GPU timings remain local-only.
test('War Room benchmark restores an authenticated Home without the sign-in form', async ({ browser }) => {
  test.setTimeout(100_000);
  const context = await browser.newContext({
    baseURL: test.info().project.use.baseURL || 'http://127.0.0.1:4173/chess-studio/',
    viewport: { width: 1440, height: 900 },
    serviceWorkers: 'block',
  });
  try {
    await context.addInitScript(() => {
      localStorage.setItem('chess-study-auth-token', 'e2e-token');
      localStorage.setItem('chess-study-auth-username', 'e2e');
      sessionStorage.setItem('chess-study-current-view', 'menu');
    });
    const page = await context.newPage();
    await mockApi(page);
    await page.goto('./', { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('region', { name: 'Modos principales', exact: true }))
      .toBeVisible({ timeout: 45_000 });
    await waitForHomeInteractive(page);
    await expect(page.getByLabel('Usuario')).toHaveCount(0);
    await expect(page.getByRole('button', { name: /Partida rápida/ })).toBeVisible();
  } finally {
    await context.close();
  }
});

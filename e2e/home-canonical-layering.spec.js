import { expect, test } from '@playwright/test';
import { login, mockApi } from './helpers.js';

async function openHome(page) {
  await mockApi(page, {
    profileSeed: {
      'matthias.onboarded': '2',
      'chess-study-home-guide-dismissed-v1': '1',
    },
  });
  await login(page);
  const home = page.getByRole('region', { name: 'Modos principales' });
  await expect(home).toBeVisible();
  return home;
}

test('Home canónica · el canvas 3D listo nunca apaga el master 2D', async ({ page }) => {
  await page.setViewportSize({ width: 980, height: 1740 });
  const home = await openHome(page);
  const canvas = home.locator('.illustrated-home__castle-3d');
  const art = home.locator('.illustrated-home__art');

  await expect(art).toBeVisible();
  await expect(canvas).toHaveClass(/is-ready/, { timeout: 15_000 });
  await expect(art).toBeVisible();

  const opacity = await art.evaluate((node) => Number.parseFloat(getComputedStyle(node).opacity));
  expect(opacity).toBeGreaterThanOrEqual(0.99);
});

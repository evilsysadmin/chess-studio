import { expect, test } from '@playwright/test';
import { login, mockApi } from './helpers.js';

async function openHome(page) {
  await mockApi(page);
  await login(page);
  const guide = page.getByRole('region', { name: 'Guía rápida de Chess Studio' });
  if (await guide.isVisible().catch(() => false)) {
    await guide.getByRole('button', { name: 'Ahora no', exact: true }).click();
  }
}

test('Home desktop · el cierre del reproductor sigue visible tras hacer scroll', async ({ page }) => {
  await page.setViewportSize({ width: 1200, height: 520 });
  await openHome(page);

  const dock = page.locator('.global-music-dock');
  const open = page.getByRole('button', { name: 'Abrir reproductor de música', exact: true });
  await expect(open).toBeVisible();
  await open.click();

  const expanded = dock.locator('.music-deck-expanded');
  const collapse = page.getByRole('button', { name: 'Plegar reproductor de música', exact: true });
  await expect(expanded).toBeVisible();
  await expect(collapse).toBeVisible();

  await expanded.evaluate((node) => { node.scrollTop = node.scrollHeight; });
  await expect.poll(async () => expanded.evaluate((node) => node.scrollTop)).toBeGreaterThan(0);

  const [deckBox, collapseBox] = await Promise.all([expanded.boundingBox(), collapse.boundingBox()]);
  expect(deckBox).not.toBeNull();
  expect(collapseBox).not.toBeNull();
  expect(collapseBox.y).toBeGreaterThanOrEqual(deckBox.y);
  expect(collapseBox.y + collapseBox.height).toBeLessThanOrEqual(deckBox.y + 48);

  await collapse.click();
  await expect(dock.locator('.music-deck-collapsed')).toBeVisible();
});

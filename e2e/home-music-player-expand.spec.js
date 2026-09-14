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

test('Home desktop · el reproductor plegado no invade el hotspot de Matthias', async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 768 });
  await openHome(page);

  const openPlayer = page.getByRole('button', { name: 'Abrir reproductor de música', exact: true });
  const matthias = page.getByRole('complementary', { name: 'Rincón de Matthias' })
    .getByRole('button', { name: 'Abrir Así juegas con Matthias', exact: true });

  await expect(openPlayer).toBeVisible();
  await expect(matthias).toBeVisible();

  const playerBox = await openPlayer.boundingBox();
  const matthiasBox = await matthias.boundingBox();
  expect(playerBox).not.toBeNull();
  expect(matthiasBox).not.toBeNull();
  expect(playerBox.x + playerBox.width).toBeLessThanOrEqual(matthiasBox.x);

  await matthias.click();
  await expect(page.getByRole('heading', { name: 'Así juegas', exact: true })).toBeVisible();
});

test('Home desktop · el reproductor expandido permanece entero dentro del viewport', async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 520 });
  await openHome(page);

  const dock = page.locator('.global-music-dock');
  const openPlayer = page.getByRole('button', { name: 'Abrir reproductor de música', exact: true });
  await expect(dock).toBeVisible();
  await expect(openPlayer).toBeVisible();

  await openPlayer.click();

  const expanded = dock.locator('.music-deck-expanded');
  await expect(expanded).toBeVisible();
  await expect(page.getByRole('button', { name: 'Plegar reproductor de música', exact: true })).toBeVisible();

  const box = await expanded.boundingBox();
  expect(box).not.toBeNull();
  expect(box.y).toBeGreaterThanOrEqual(8);
  expect(box.y + box.height).toBeLessThanOrEqual(512);
});
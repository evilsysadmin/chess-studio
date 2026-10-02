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

test('Home desktop · el reproductor plegado no roba el hitbox de Matthias y expandido cabe en viewport', async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 520 });
  await openHome(page);

  const dock = page.locator('.global-music-dock');
  const openPlayer = page.getByRole('button', { name: 'Abrir reproductor de música', exact: true });
  const matthias = page.getByRole('button', { name: 'Abrir Así juegas con Matthias', exact: true });
  await expect(dock).toBeVisible();
  await expect(openPlayer).toBeVisible();
  await expect(matthias).toBeVisible();

  const collapsedBox = await dock.boundingBox();
  const openBox = await openPlayer.boundingBox();
  const matthiasBox = await matthias.boundingBox();
  expect(collapsedBox).not.toBeNull();
  expect(openBox).not.toBeNull();
  expect(matthiasBox).not.toBeNull();
  expect(collapsedBox.width).toBeGreaterThanOrEqual(180);
  expect(collapsedBox.width).toBeLessThanOrEqual(200);
  expect(openBox.width).toBeGreaterThanOrEqual(145);
  expect(openBox.y).toBeGreaterThanOrEqual(8);
  expect(openBox.y + openBox.height).toBeLessThanOrEqual(512);

  const serviceStatus = dock.locator('.live-service-status');
  if (await serviceStatus.isVisible().catch(() => false)) {
    const serviceBox = await serviceStatus.boundingBox();
    expect(serviceBox).not.toBeNull();
    expect(serviceBox.y).toBeGreaterThanOrEqual(8);
    expect(serviceBox.y + serviceBox.height).toBeLessThanOrEqual(512);
  }

  const overlapsMatthias = openBox.x < matthiasBox.x + matthiasBox.width
    && openBox.x + openBox.width > matthiasBox.x
    && openBox.y < matthiasBox.y + matthiasBox.height
    && openBox.y + openBox.height > matthiasBox.y;
  expect(overlapsMatthias).toBe(false);

  await openPlayer.click();

  const expanded = dock.locator('.music-deck-expanded');
  await expect(expanded).toBeVisible();
  await expect(page.getByRole('button', { name: 'Plegar reproductor de música', exact: true })).toBeVisible();

  const box = await expanded.boundingBox();
  expect(box).not.toBeNull();
  expect(box.y).toBeGreaterThanOrEqual(8);
  expect(box.y + box.height).toBeLessThanOrEqual(512);
});
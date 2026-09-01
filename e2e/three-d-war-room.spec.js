import { expect, test } from '@playwright/test';
import { buttonWithVisibleText, gameTurn, login, mockApi } from './helpers.js';

test('Partida rápida · una partida activa · vista 3D usa la sala de mando y sigue cabiendo en móvil', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 960 });
  await mockApi(page);
  await login(page);

  await buttonWithVisibleText(page, 'Partida rápida').click();
  await page.getByRole('button', { name: 'Empezar partida', exact: true }).click();
  await expect(gameTurn(page)).toBeVisible();

  const rendererToggle = page.getByRole('button', { name: 'Vista · 2D', exact: true });
  await expect(rendererToggle).toBeVisible();
  await rendererToggle.click();

  const warRoom = page.locator('.board-live-row.is-3d-warroom');
  await expect(warRoom).toBeVisible();
  const board3d = page.locator('[data-board3d-war-room="true"]');
  await expect(board3d).toBeVisible();
  await expect(board3d).toHaveAttribute('data-board3d-scene', 'premium');
  await expect(warRoom.getByRole('complementary', { name: 'Puesto de mando de Matthias' })).toBeVisible();
  await expect(warRoom.getByText('COMANDANTE RIVAL', { exact: true })).toBeVisible();

  const portrait = warRoom.locator('.game-3d-matthias-portrait');
  await expect(portrait).toBeVisible();
  expect(await portrait.evaluate((img) => img.naturalWidth)).toBeGreaterThan(0);

  const canvas = page.locator('.board3d-main-canvas');
  await expect(canvas).toBeVisible();
  const desktopGeometry = await page.locator('.board3d-main-shell').evaluate((element) => {
    const rect = element.getBoundingClientRect();
    return { width: rect.width, height: rect.height };
  });
  expect(desktopGeometry.width).toBeGreaterThan(640);
  expect(desktopGeometry.height).toBeGreaterThan(540);

  const warRoomGeometry = await warRoom.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    return { width: rect.width, left: rect.left, right: rect.right };
  });
  expect(warRoomGeometry.width).toBeGreaterThan(1320);
  expect(warRoomGeometry.left).toBeGreaterThanOrEqual(0);
  expect(warRoomGeometry.right).toBeLessThanOrEqual(1441);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);

  await page.setViewportSize({ width: 390, height: 844 });
  await expect(warRoom).toBeVisible();
  await expect(board3d).toBeVisible();
  const mobileBoardWidth = await page.locator('.board3d-main-shell').evaluate((element) => element.getBoundingClientRect().width);
  expect(mobileBoardWidth).toBeGreaterThan(320);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);

  await warRoom.getByRole('button', { name: '2D', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Vista · 2D', exact: true })).toBeVisible();
  await expect(page.locator('.board-live-row.is-3d-warroom')).toHaveCount(0);
});

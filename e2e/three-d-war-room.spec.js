import { expect, test } from '@playwright/test';
import { buttonWithVisibleText, gameTurn, login, mockApi } from './helpers.js';

function normalized(vector) {
  const length = Math.hypot(...vector);
  return vector.map((value) => value / length);
}

function cross(a, b) {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
}

function dot(a, b) {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

function projectWarRoomSquare(rect, square, worldY = 0.12) {
  const aspect = Math.max(0.35, rect.width / Math.max(1, rect.height));
  const profile = aspect >= 1.42
    ? { halfSpan: 5.38, padding: 1.07, minDistance: 13.2, maxDistance: 22.6, targetY: 1.08, targetZ: -0.16, cameraY: 7.35, cameraZ: 10.6 }
    : { halfSpan: 5.78, padding: 1.13, minDistance: 14.5, maxDistance: 25.6, targetY: 0.92, targetZ: -0.08, cameraY: 8.2, cameraZ: 10.72 };
  const verticalFov = 40 * Math.PI / 180;
  const horizontalFov = 2 * Math.atan(Math.tan(verticalFov / 2) * aspect);
  const limitingFov = Math.min(verticalFov, horizontalFov);
  const unclampedDistance = (profile.halfSpan / Math.tan(limitingFov / 2)) * profile.padding;
  const distance = Math.max(profile.minDistance, Math.min(profile.maxDistance, unclampedDistance));
  const target = [0, profile.targetY, -profile.targetZ];
  const direction = normalized([0, profile.cameraY, profile.cameraZ]);
  const camera = target.map((value, index) => value + direction[index] * distance);
  const fileIndex = square.charCodeAt(0) - 97;
  const rank = Number(square[1]);
  const point = [fileIndex - 3.5, worldY, 4.5 - rank];
  const forward = normalized(target.map((value, index) => value - camera[index]));
  const right = normalized(cross(forward, [0, 1, 0]));
  const up = cross(right, forward);
  const relative = point.map((value, index) => value - camera[index]);
  const depth = dot(relative, forward);
  const ndcX = dot(relative, right) / (depth * Math.tan(verticalFov / 2) * aspect);
  const ndcY = dot(relative, up) / (depth * Math.tan(verticalFov / 2));
  return {
    x: rect.x + ((ndcX + 1) / 2) * rect.width,
    y: rect.y + ((1 - ndcY) / 2) * rect.height,
  };
}

async function clickWarRoomSquare(page, rect, square, worldY = 0.12) {
  const point = projectWarRoomSquare(rect, square, worldY);
  await page.mouse.click(point.x, point.y);
}

async function openQuickGameWarRoom(page, requestLog = []) {
  await page.setViewportSize({ width: 1440, height: 960 });
  await mockApi(page, { requestLog });
  await login(page);

  await buttonWithVisibleText(page, 'Partida rápida').click();
  await page.getByRole('button', { name: 'Empezar partida', exact: true }).click();
  await expect(gameTurn(page)).toBeVisible();

  const rendererToggle = page.getByRole('button', { name: 'Vista · 2D', exact: true });
  await expect(rendererToggle).toBeVisible();
  await rendererToggle.click();

  const warRoom = page.locator('.board-live-row.is-3d-warroom');
  const board3d = page.locator('[data-board3d-war-room="true"]');
  const canvas = page.locator('.board3d-main-canvas');
  await expect(warRoom).toBeVisible();
  await expect(board3d).toBeVisible();
  await expect(canvas).toBeVisible();
  return { warRoom, board3d, canvas };
}

test('War Room · desktop input mantiene cámara fija y juega e2→e4', async ({ page }) => {
  test.setTimeout(45_000);

  const requestLog = [];
  const { board3d, canvas } = await openQuickGameWarRoom(page, requestLog);
  await expect(board3d).toHaveAttribute('data-board3d-scene', 'premium');
  await expect(board3d).toHaveAttribute('data-board3d-camera', 'fixed-tactical');

  const canvasRect = await canvas.boundingBox();
  expect(canvasRect).not.toBeNull();

  await page.mouse.move(canvasRect.x + canvasRect.width * 0.2, canvasRect.y + canvasRect.height * 0.25);
  await page.mouse.move(canvasRect.x + canvasRect.width * 0.8, canvasRect.y + canvasRect.height * 0.7);
  await expect(board3d).toHaveAttribute('data-board3d-inspect', 'false');
  await expect(board3d).toHaveAttribute('data-board3d-camera', 'fixed-tactical');

  await clickWarRoomSquare(page, canvasRect, 'e2', 0.76);
  await clickWarRoomSquare(page, canvasRect, 'e4');
  await expect.poll(() => requestLog.filter((entry) => entry.method === 'POST' && /\/games\/[^/]+\/move$/.test(entry.path)).length).toBe(1);
});

test('Partida rápida · una partida activa · vista 3D usa la Sala de guerra y sigue cabiendo en móvil', async ({ page }) => {
  test.setTimeout(60_000);

  const { warRoom, board3d } = await openQuickGameWarRoom(page);
  await expect(board3d).toHaveAttribute('data-board3d-scene', 'premium');
  await expect(board3d).toHaveAttribute('data-board3d-camera', 'fixed-tactical');
  await expect(warRoom.getByRole('complementary', { name: 'Puesto táctico de Matthias' })).toBeVisible();
  await expect(warRoom.getByText('COMANDANTE RIVAL', { exact: true })).toBeVisible();
  await expect(warRoom.getByText('SALA DE GUERRA · CÁMARA TÁCTICA', { exact: true })).toBeVisible();

  const portrait = warRoom.locator('.game-3d-matthias-portrait');
  await expect(portrait).toBeVisible();
  expect(await portrait.evaluate((img) => img.naturalWidth)).toBeGreaterThan(0);

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

  await page.setViewportSize({ width: 1662, height: 796 });
  await expect(warRoom).toBeVisible();
  const shortDesktopGeometry = await page.locator('.board3d-main-shell').evaluate((element) => {
    const rect = element.getBoundingClientRect();
    return { width: rect.width, height: rect.height, bottom: rect.bottom };
  });
  expect(shortDesktopGeometry.width).toBeGreaterThan(700);
  expect(shortDesktopGeometry.height).toBeGreaterThan(550);
  expect(shortDesktopGeometry.height).toBeLessThan(590);
  expect(shortDesktopGeometry.bottom).toBeLessThanOrEqual(796);
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

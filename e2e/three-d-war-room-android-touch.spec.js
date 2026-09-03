import { devices, expect, test } from '@playwright/test';
import { buttonWithVisibleText, gameTurn, login, mockApi } from './helpers.js';
import { getWarRoomMobileFramingProfile } from '../frontend/src/components/WarRoomMobileFraming.js';

test.use({ ...devices['Pixel 5'] });

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
  const mobileProfile = getWarRoomMobileFramingProfile({
    aspect,
    coarsePointer: true,
    viewportWidth: rect.width,
  });
  const profile = mobileProfile || (aspect >= 1.42
    ? { halfSpan: 5.38, padding: 1.07, minDistance: 13.2, maxDistance: 22.6, targetY: 1.08, targetZ: -0.16, cameraY: 7.35, cameraZ: 10.6 }
    : { halfSpan: 5.78, padding: 1.13, minDistance: 14.5, maxDistance: 25.6, targetY: 0.92, targetZ: -0.08, cameraY: 8.2, cameraZ: 10.72 });
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

async function touchStart(cdp, point) {
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [{ x: point.x, y: point.y, radiusX: 4, radiusY: 4, force: 0.7, id: 1 }],
  });
}

async function touchMove(cdp, point) {
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchMove',
    touchPoints: [{ x: point.x + 8, y: point.y + 5, radiusX: 4, radiusY: 4, force: 0.7, id: 1 }],
  });
}

async function touchEnd(cdp) {
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchEnd',
    touchPoints: [],
  });
}

function movePosts(requestLog) {
  return requestLog.filter((entry) => entry.method === 'POST' && /\/games\/[^/]+\/move$/.test(entry.path));
}

async function open3DFromAppearance(page) {
  await expect(page.getByRole('button', { name: 'Vista · 2D', exact: true })).toBeHidden();
  await page.getByRole('button', { name: 'Cambiar apariencia y piezas del tablero', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Ajustes' });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('radiogroup', { name: 'Estilo de piezas' })).toBeVisible();
  await dialog.getByRole('radio', { name: /3D$/ }).click();
  await dialog.getByRole('button', { name: 'Cerrar', exact: true }).click();
}

test('War Room · Android selecciona una pieza en pointerdown y muestra destinos reales', async ({ page }) => {
  test.setTimeout(75_000);
  await page.addInitScript(() => {
    window.__warRoomPointerCaptures = [];
    const original = Element.prototype.setPointerCapture;
    Element.prototype.setPointerCapture = function patchedSetPointerCapture(pointerId) {
      window.__warRoomPointerCaptures.push({ pointerId, className: String(this.className || '') });
      return original?.call(this, pointerId);
    };
  });

  const requestLog = [];
  await mockApi(page, { requestLog });
  await login(page);

  await buttonWithVisibleText(page, 'Partida rápida').click();
  await page.getByRole('button', { name: 'Empezar partida', exact: true }).click();
  await expect(gameTurn(page)).toBeVisible();

  await open3DFromAppearance(page);

  const board3d = page.locator('[data-board3d-war-room="true"]');
  const canvas = page.locator('.board3d-main-canvas');
  await expect(board3d).toBeVisible({ timeout: 30_000 });
  await expect(canvas).toBeVisible({ timeout: 30_000 });
  await expect(board3d).toHaveAttribute('data-board3d-camera', 'fixed-tactical', { timeout: 30_000 });

  const matthiasCard = page.locator('.game-3d-matthias-card');
  const focusButton = page.getByRole('button', { name: 'Focus', exact: true });
  const abandonButton = page.getByRole('button', { name: 'Abandonar partida', exact: true });
  const appearanceButton = page.locator('.board3d-customize');
  await expect(matthiasCard).toBeVisible();
  await expect(focusButton).toBeVisible();
  await expect(abandonButton).toBeVisible();
  await expect(appearanceButton).toBeVisible();

  const matthiasRect = await matthiasCard.boundingBox();
  const boardRect = await board3d.boundingBox();
  const focusRect = await focusButton.boundingBox();
  const appearanceRect = await appearanceButton.boundingBox();
  expect(matthiasRect).not.toBeNull();
  expect(boardRect).not.toBeNull();
  expect(focusRect).not.toBeNull();
  expect(appearanceRect).not.toBeNull();
  expect(matthiasRect.height).toBeLessThanOrEqual(72);
  expect(focusRect.y + focusRect.height).toBeLessThanOrEqual(boardRect.y + 2);
  expect(appearanceRect.y).toBeLessThan(boardRect.y + 90);

  expect(await canvas.evaluate((element) => getComputedStyle(element).touchAction)).toBe('none');
  expect(await canvas.evaluate((element) => {
    const value = getComputedStyle(element).webkitTapHighlightColor;
    return value === 'transparent' || value === 'rgba(0, 0, 0, 0)';
  })).toBe(true);

  const rect = await canvas.boundingBox();
  expect(rect).not.toBeNull();
  const from = projectWarRoomSquare(rect, 'e2', 0.76);
  const to = projectWarRoomSquare(rect, 'e4');
  const cdp = await page.context().newCDPSession(page);

  await touchStart(cdp, from);
  await expect(canvas).toHaveAttribute('data-war-room-last-square', 'e2');
  await expect(board3d).toHaveAttribute('data-board3d-selected', 'e2');
  await expect.poll(async () => Number(await board3d.getAttribute('data-board3d-legal-target-count'))).toBeGreaterThan(0);
  await expect.poll(() => movePosts(requestLog).length).toBe(0);
  expect(await page.evaluate(() => window.__warRoomPointerCaptures.some((entry) => entry.className.includes('board3d-main-canvas')))).toBe(true);

  await touchMove(cdp, from);
  await touchEnd(cdp);

  await touchStart(cdp, to);
  await expect(canvas).toHaveAttribute('data-war-room-last-square', 'e4');
  // Critical contract: moving to a legal destination must happen on the real
  // second pointerdown, before Android delivers touchEnd.
  await expect.poll(() => movePosts(requestLog).length).toBe(1);
  await touchEnd(cdp);
});

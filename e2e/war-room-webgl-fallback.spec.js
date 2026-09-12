import { expect, test } from '@playwright/test';
import { buttonWithVisibleText, clickBoardMove, login, mockApi } from './helpers.js';

function movePosts(requestLog) {
  return requestLog.filter((entry) => entry.method === 'POST' && /\/games\/[^/]+\/move$/.test(entry.path));
}

test('War Room · sin WebGL degrada a 2D y conserva la partida jugable', async ({ page }) => {
  test.setTimeout(90_000);
  const requestLog = [];
  await mockApi(page, { requestLog });
  await login(page);

  // Home puede haber usado ya su propio renderer. Rompemos sólo los contextos
  // WebGL que se pidan a partir de aquí, justo antes de montar la War Room.
  await page.evaluate(() => {
    const originalGetContext = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function warRoomNoWebGL(type, attributes) {
      if (type === 'webgl' || type === 'webgl2' || type === 'experimental-webgl') return null;
      return originalGetContext.call(this, type, attributes);
    };
  });

  await buttonWithVisibleText(page, 'Partida rápida').click();
  await page.getByRole('button', { name: 'Empezar partida', exact: true }).click();

  const fallback = page.locator('.board3d-fallback');
  await expect(fallback).toBeVisible({ timeout: 30_000 });
  await expect(fallback).toContainText('3D no disponible en este dispositivo · usando 2D');
  await expect(fallback.locator('.board-grid')).toBeVisible();
  await expect(page.locator('.board3d-main-canvas')).toHaveCount(0);
  await expect(page.locator('.error-boundary-screen')).toHaveCount(0);

  await clickBoardMove(page, 'e2', 'e4');
  await expect.poll(() => movePosts(requestLog).length, { timeout: 10_000 }).toBe(1);
  await expect(fallback.locator('.board-grid')).toBeVisible();
  await expect(page.locator('.error-boundary-screen')).toHaveCount(0);
});

test('War Room · perder WebGL en mitad de partida cae a 2D sin perder la sesión', async ({ page }) => {
  test.setTimeout(90_000);
  const requestLog = [];
  await mockApi(page, { requestLog });
  await login(page);

  await buttonWithVisibleText(page, 'Partida rápida').click();
  await page.getByRole('button', { name: 'Empezar partida', exact: true }).click();

  const canvas = page.locator('.board3d-main-canvas');
  await expect(canvas).toBeVisible({ timeout: 30_000 });

  await canvas.evaluate((element) => {
    element.dispatchEvent(new Event('webglcontextlost', { cancelable: true }));
  });

  const fallback = page.locator('.board3d-fallback');
  await expect(fallback).toBeVisible({ timeout: 10_000 });
  await expect(fallback).toContainText('3D no disponible en este dispositivo · usando 2D');
  await expect(fallback.locator('.board-grid')).toBeVisible();
  await expect(page.locator('.board3d-main-canvas')).toHaveCount(0);
  await expect(page.locator('.error-boundary-screen')).toHaveCount(0);

  await clickBoardMove(page, 'e2', 'e4');
  await expect.poll(() => movePosts(requestLog).length, { timeout: 10_000 }).toBe(1);
  await expect(fallback.locator('.board-grid')).toBeVisible();
  await expect(page.locator('.error-boundary-screen')).toHaveCount(0);
});

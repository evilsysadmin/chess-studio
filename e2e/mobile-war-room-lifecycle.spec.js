import { expect, test } from '@playwright/test';
import { buttonWithVisibleText, gameStatus, login, mockApi } from './helpers.js';
import { navigateWarRoomKeyboard } from './war-room-board-input.js';

async function setVisibility(page, state) {
  await page.evaluate((nextState) => {
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      get: () => nextState,
    });
    Object.defineProperty(document, 'hidden', {
      configurable: true,
      get: () => nextState !== 'visible',
    });
    document.dispatchEvent(new Event('visibilitychange'));
  }, state);
}

function movePosts(requestLog) {
  return requestLog.filter((entry) => entry.method === 'POST' && /\/games\/[^/]+\/move$/.test(entry.path));
}

test('Android · War Room conserva selección y jugabilidad tras rotación y background/foreground repetidos', async ({ page }) => {
  test.setTimeout(120_000);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize({ width: 390, height: 844 });
  const requestLog = [];
  await mockApi(page, { requestLog });
  await login(page);

  await buttonWithVisibleText(page, 'Partida rápida').click();
  await page.getByRole('button', { name: 'Empezar partida', exact: true }).click();
  await expect(gameStatus(page)).toBeVisible();

  const warRoom = page.locator('[data-board3d-war-room="true"]');
  const canvas = page.locator('.board3d-main-canvas');
  await expect(warRoom).toBeVisible({ timeout: 30_000 });
  await expect(canvas).toHaveCount(1);

  // Mantener una selección real durante todo el soak obliga a resize/orientation
  // a conservar el estado común de partida y no sólo a evitar un crash visual.
  await navigateWarRoomKeyboard(canvas, warRoom, 'e2');
  await canvas.press('Enter');
  await expect(warRoom).toHaveAttribute('data-board3d-selected', 'e2');
  await expect(warRoom).toHaveAttribute('data-board3d-legal-target-count', '2');

  for (let cycle = 0; cycle < 12; cycle += 1) {
    const landscape = cycle % 2 === 0;
    await setVisibility(page, 'hidden');
    await page.setViewportSize(landscape
      ? { width: 844, height: 390 }
      : { width: 390, height: 844 });
    await setVisibility(page, 'visible');

    await expect(gameStatus(page)).toBeVisible();
    await expect(warRoom).toHaveCount(1);
    await expect(canvas).toHaveCount(1);
    await expect(warRoom).toHaveAttribute('data-board3d-selected', 'e2');
    await expect(warRoom).toHaveAttribute('data-board3d-legal-target-count', '2');
    await expect(page.locator('.error-boundary-screen')).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
  }

  await page.setViewportSize({ width: 390, height: 844 });
  await expect(warRoom).toBeVisible();
  await expect(canvas).toBeVisible();
  await expect(canvas).toHaveCount(1);

  // Y no basta con conservar highlights: después del último resize la selección
  // tiene que seguir siendo operativa y generar exactamente una mutación real.
  await navigateWarRoomKeyboard(canvas, warRoom, 'e4');
  await canvas.press('Enter');
  await expect.poll(() => movePosts(requestLog).length, { timeout: 10_000 }).toBe(1);
  await expect(warRoom).toHaveAttribute('data-board3d-selected', '');
  await expect(warRoom).toHaveAttribute('data-board3d-legal-target-count', '0');
  await expect(page.locator('.error-boundary-screen')).toHaveCount(0);
});
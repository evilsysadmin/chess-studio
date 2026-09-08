import { expect, test } from '@playwright/test';
import { buttonWithVisibleText, gameStatus, login, mockApi } from './helpers.js';

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

test('Android · War Room sobrevive rotación y background/foreground repetidos sin duplicar canvas', async ({ page }) => {
  test.setTimeout(120_000);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize({ width: 390, height: 844 });
  await mockApi(page);
  await login(page);

  await buttonWithVisibleText(page, 'Partida rápida').click();
  await page.getByRole('button', { name: 'Empezar partida', exact: true }).click();
  await expect(gameStatus(page)).toBeVisible();

  const warRoom = page.locator('[data-board3d-war-room="true"]');
  const canvas = page.locator('.board3d-main-canvas');
  await expect(warRoom).toBeVisible({ timeout: 30_000 });
  await expect(canvas).toHaveCount(1);

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
    await expect(page.locator('.error-boundary-screen')).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
  }

  await page.setViewportSize({ width: 390, height: 844 });
  await expect(warRoom).toBeVisible();
  await expect(canvas).toBeVisible();
  await expect(canvas).toHaveCount(1);
});

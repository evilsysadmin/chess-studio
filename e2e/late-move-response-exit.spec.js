import { expect, test } from '@playwright/test';
import { buttonWithVisibleText, gameStatus, login, mockApi } from './helpers.js';

test('jugada pendiente · salir aborta la operación y una respuesta tardía no resucita la partida', async ({ page }) => {
  test.setTimeout(60_000);
  await page.setViewportSize({ width: 390, height: 844 });
  await mockApi(page);

  let movePosts = 0;
  let releaseMove;
  const moveGate = new Promise((resolve) => { releaseMove = resolve; });

  await page.route('http://localhost:4000/api/games/*/move', async (route) => {
    if (route.request().method() !== 'POST') return route.fallback();
    movePosts += 1;
    await moveGate;
    try {
      await route.fallback();
    } catch {
      // GameScreen aborts its in-flight mutation when it unmounts. If Chromium
      // has already cancelled the intercepted request, there is deliberately
      // no response left to deliver.
    }
  });

  await login(page);
  await page.evaluate(() => {
    localStorage.setItem('chess-study-board-renderer', '2d-explicit-v1');
    window.dispatchEvent(new Event('chess-study-user-preferences-changed'));
  });

  await buttonWithVisibleText(page, 'Partida rápida').click();
  await page.getByRole('button', { name: 'Empezar partida', exact: true }).click();
  await expect(gameStatus(page)).toBeVisible();

  const e2 = page.locator('.square[aria-label^="Casilla e2,"]');
  const e4 = page.locator('.square[aria-label^="Casilla e4,"]');
  await e2.click();
  await e4.click();
  await expect.poll(() => movePosts, { timeout: 5_000 }).toBe(1);
  await expect(page.getByRole('button', { name: /^Casilla e4, peón blanco/i })).toBeVisible();

  await page.getByRole('button', { name: 'Abandonar partida', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: '¿Abandonar la partida?' });
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: /Cancelar sin penalización|Abandonar y asumir resultado/ }).click();

  await expect(page.locator('.illustrated-home')).toBeVisible({ timeout: 10_000 });
  await expect(gameStatus(page)).toHaveCount(0);

  releaseMove();
  await page.waitForTimeout(750);

  expect(movePosts).toBe(1);
  await expect(page.locator('.illustrated-home')).toBeVisible();
  await expect(gameStatus(page)).toHaveCount(0);
  await expect(page.locator('.error-boundary-screen')).toHaveCount(0);
});

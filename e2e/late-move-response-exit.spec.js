import { expect, test } from '@playwright/test';
import { buttonWithVisibleText, clickBoardMove, gameStatus, login, mockApi } from './helpers.js';

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
  // Renderer is a device preference now; Quick Match no longer owns a 2D/3D selector.
  // Pin this network/lifecycle test to 2D without coupling it to unrelated modal UI.
  await page.evaluate(() => {
    localStorage.setItem('chess-study-device-board-renderer-v1', '2d');
    localStorage.setItem('chess-study-mechanic-tutorial-progress-v1', JSON.stringify({
      'war-room-basics': { seen: true, completedAt: 'e2e' },
    }));
  });
  await buttonWithVisibleText(page, 'Partida rápida').click();
  const quickMatch = page.getByRole('dialog', { name: 'Configurar partida rápida' });
  await expect(quickMatch).toBeVisible();
  await quickMatch.getByRole('button', { name: 'Empezar partida', exact: true }).click();
  await expect(gameStatus(page)).toBeVisible();

  await clickBoardMove(page, 'e2', 'e4');
  await expect.poll(() => movePosts, { timeout: 5_000 }).toBe(1);

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

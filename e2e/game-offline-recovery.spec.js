import { expect, test } from '@playwright/test';
import { buttonWithVisibleText, gameStatus, login, mockApi } from './helpers.js';

async function waitForActive2DBoard(page) {
  await expect(gameStatus(page)).toBeVisible({ timeout: 20_000 });
  await expect(page.locator('.board')).toBeVisible({ timeout: 20_000 });
  await expect(page.locator('.error-boundary-screen')).toHaveCount(0);
}

test('partida activa · offline→online no envenena la sesión y F5 sigue restaurando', async ({ page, context }) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 390, height: 844 });
  await mockApi(page);
  await login(page);

  await page.evaluate(() => {
    localStorage.setItem('chess-study-board-renderer', '2d-explicit-v1');
    window.dispatchEvent(new Event('chess-study-user-preferences-changed'));
  });

  await buttonWithVisibleText(page, 'Partida rápida').click();
  await page.getByRole('button', { name: 'Empezar partida', exact: true }).click();
  await waitForActive2DBoard(page);

  await context.setOffline(true);
  await expect.poll(() => page.evaluate(() => navigator.onLine)).toBe(false);
  await expect(gameStatus(page)).toBeVisible();
  await expect(page.locator('.error-boundary-screen')).toHaveCount(0);

  await context.setOffline(false);
  await expect.poll(() => page.evaluate(() => navigator.onLine)).toBe(true);
  await waitForActive2DBoard(page);

  // Prove the recovered page can still mutate the active game through the API.
  await page.locator('.square[aria-label^="Casilla e2,"]').click();
  await page.locator('.square[aria-label^="Casilla e4,"]').click();
  await expect(page.getByRole('button', { name: /^Casilla e4, peón blanco/i })).toBeVisible({ timeout: 10_000 });
  await expect(page.locator('.error-boundary-screen')).toHaveCount(0);

  await page.reload();
  await waitForActive2DBoard(page);
  await expect(page.getByRole('button', { name: /^Casilla e4, peón blanco/i })).toBeVisible({ timeout: 20_000 });
});

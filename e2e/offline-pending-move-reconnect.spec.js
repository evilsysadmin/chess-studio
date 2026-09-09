import { expect, test } from '@playwright/test';
import { buttonWithVisibleText, gameStatus, login, mockApi } from './helpers.js';

test('offline→online durante /move pendiente no revierte el movimiento optimista ni duplica la mutación', async ({ page }) => {
  test.setTimeout(75_000);
  await page.setViewportSize({ width: 390, height: 844 });

  const requestLog = [];
  await mockApi(page, { requestLog });

  let movePosts = 0;
  let reconnectGets = 0;
  let releaseMove;
  const moveGate = new Promise((resolve) => { releaseMove = resolve; });

  await page.route('http://localhost:4000/api/games/*/move', async (route) => {
    if (route.request().method() !== 'POST') return route.fallback();
    movePosts += 1;
    await moveGate;
    await route.fallback();
  });

  await page.route('http://localhost:4000/api/games/*', async (route) => {
    if (route.request().method() === 'GET' && !route.request().url().endsWith('/move')) reconnectGets += 1;
    await route.fallback();
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
  await expect(e2).toHaveAttribute('aria-label', /peón blanco/i);
  await e2.click();
  await e4.click();

  await expect.poll(() => movePosts, { timeout: 5_000 }).toBe(1);
  await expect(page.getByRole('button', { name: /^Casilla e4, peón blanco/i })).toBeVisible();
  await expect(page.getByRole('button', { name: /^Casilla e2,/i })).not.toHaveAttribute('aria-label', /peón blanco/i);

  await page.evaluate(() => {
    window.dispatchEvent(new Event('offline'));
    window.dispatchEvent(new Event('online'));
  });

  // Mientras /move sigue en SAVING, el reconnect debe quedar aplazado. Consultar
  // Mongo ahora podría devolver la foto anterior y hacer rollback del movimiento optimista.
  await page.waitForTimeout(250);
  expect(reconnectGets).toBe(0);
  await expect(page.getByRole('button', { name: /^Casilla e4, peón blanco/i })).toBeVisible();
  await expect(page.getByRole('button', { name: /^Casilla e2,/i })).not.toHaveAttribute('aria-label', /peón blanco/i);
  expect(movePosts).toBe(1);

  releaseMove();

  // Al terminar la mutación pendiente sí se permite reconciliar con la foto ya
  // autoritativa. El reconnect no puede borrar e4 ni generar otro POST.
  await expect.poll(() => reconnectGets, { timeout: 5_000 }).toBeGreaterThanOrEqual(1);
  await expect(page.getByRole('button', { name: /^Casilla e4, peón blanco/i })).toBeVisible({ timeout: 10_000 });
  await expect(gameStatus(page)).toBeVisible();
  expect(movePosts).toBe(1);
  expect(requestLog.filter((entry) => entry.method === 'POST' && /\/api\/games\/[^/]+\/move$/.test(entry.path))).toHaveLength(1);
  await expect(page.locator('.error-boundary-screen')).toHaveCount(0);
});

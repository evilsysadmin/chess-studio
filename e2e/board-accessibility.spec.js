import { expect, test } from '@playwright/test';
import { buttonWithVisibleText, gameStatus, login, mockApi } from './helpers.js';

test('Accesibilidad · el tablero 2D ofrece navegación de teclado y nombres útiles para lector de pantalla', async ({ page }) => {
  test.setTimeout(45_000);
  await mockApi(page);
  await login(page);

  await buttonWithVisibleText(page, 'Partida rápida').click();
  const quickMatch = page.getByRole('dialog', { name: 'Configurar partida rápida' });
  await expect(quickMatch).toBeVisible();
  await quickMatch.getByRole('button', { name: '2D', exact: true }).click();
  await quickMatch.getByRole('button', { name: 'Empezar partida', exact: true }).click();
  await expect(gameStatus(page)).toBeVisible();

  const board = page.getByRole('group', { name: /Tablero de ajedrez/ }).first();
  await expect(board).toBeVisible();
  await expect(board).toHaveAccessibleName(/Usa las flechas para recorrer casillas y Enter o espacio para seleccionar/);

  const squares = board.locator('.square[role="button"]');
  await expect(squares).toHaveCount(64);
  expect(await squares.evaluateAll((nodes) => nodes.filter((node) => node.tabIndex === 0).length)).toBe(1);

  const e2 = board.getByRole('button', { name: /^Casilla e2, peón blanco/i });
  const e3 = board.getByRole('button', { name: /^Casilla e3, vacía/i });
  await expect(e2).toHaveAccessibleName(/^Casilla e2, peón blanco/i);
  await expect(e3).toHaveAccessibleName(/^Casilla e3, vacía/i);

  await e2.focus();
  await expect(e2).toHaveAttribute('tabindex', '0');
  await page.keyboard.press('Enter');
  await expect(e2).toHaveAccessibleName(/seleccionada/i);

  await page.keyboard.press('ArrowUp');
  await expect.poll(() => page.evaluate(() => document.activeElement?.getAttribute('aria-label') || ''))
    .toMatch(/^Casilla e3, vacía/i);
  await expect(e3).toHaveAttribute('tabindex', '0');
  expect(await squares.evaluateAll((nodes) => nodes.filter((node) => node.tabIndex === 0).length)).toBe(1);
});

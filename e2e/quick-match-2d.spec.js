import { expect, test } from '@playwright/test';
import { buttonWithVisibleText, login, mockApi } from './helpers.js';

async function launchQuickMatch2D(page) {
  await buttonWithVisibleText(page, 'Partida rápida').click();
  const dialog = page.getByRole('dialog', { name: 'Configurar partida rápida' });
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: 'Jugar en 2D, directo al tablero', exact: true }).click();
}

test('Partida rápida · 2D entra directo al tablero ligero', async ({ page }) => {
  await mockApi(page);
  await login(page);
  await launchQuickMatch2D(page);

  await expect(page.getByRole('group', { name: /Tablero de ajedrez/ })).toBeVisible();
  await expect(page.locator('[data-board3d-war-room="true"]')).toHaveCount(0);
});

test('Partida rápida · 2D prioriza tablero y controles a 360/390/430 px', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 780 });
  await mockApi(page);
  await login(page);
  await launchQuickMatch2D(page);

  const board = page.locator('.game-screen .board-grid');
  await expect(board).toBeVisible();
  await expect(page.locator('.game-layout-3d')).toHaveCount(0);

  for (const width of [360, 390, 430]) {
    await page.setViewportSize({ width, height: 780 });

    const geometry = await page.evaluate(() => {
      const boardNode = document.querySelector('.game-screen .board-grid');
      const sideNode = document.querySelector('.game-screen .game-side-column');
      const actionsNode = document.querySelector('.game-screen .game-controls-actions');
      const rect = boardNode?.getBoundingClientRect();
      const columns = actionsNode ? getComputedStyle(actionsNode).gridTemplateColumns.split(/\s+/).filter(Boolean) : [];
      return {
        viewportWidth: window.innerWidth,
        scrollWidth: document.documentElement.scrollWidth,
        boardWidth: rect?.width || 0,
        boardLeft: rect?.left || 0,
        boardRight: rect?.right || 0,
        sideDisplay: sideNode ? getComputedStyle(sideNode).display : null,
        actionColumns: columns.length,
      };
    });

    expect(geometry.scrollWidth).toBeLessThanOrEqual(geometry.viewportWidth + 1);
    expect(geometry.boardWidth).toBeGreaterThanOrEqual(width - 48);
    expect(geometry.boardLeft).toBeGreaterThanOrEqual(0);
    expect(geometry.boardRight).toBeLessThanOrEqual(width + 1);
    expect(geometry.sideDisplay).toBe('none');
    expect(geometry.actionColumns).toBe(2);
  }
});
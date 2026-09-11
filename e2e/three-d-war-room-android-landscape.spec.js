import { devices, expect, test } from '@playwright/test';
import { buttonWithVisibleText, gameTurn, login, mockApi } from './helpers.js';

test.use({
  ...devices['Pixel 5'],
  viewport: { width: 851, height: 393 },
  screen: { width: 851, height: 393 },
});

async function open3DFromAppearance(page) {
  const board3d = page.locator('[data-board3d-war-room="true"]');
  if (await board3d.isVisible().catch(() => false)) return;

  await page.getByRole('button', { name: 'Cambiar apariencia y piezas del tablero', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Ajustes' });
  await expect(dialog).toBeVisible();
  await dialog.getByRole('radio', { name: /3D$/ }).click();
  await dialog.getByRole('button', { name: 'Cerrar', exact: true }).click();
  await expect(board3d).toBeVisible({ timeout: 30_000 });
}

test('War Room · Android landscape convierte el ancho extra en tablero, no en aire', async ({ page }) => {
  test.setTimeout(75_000);
  await mockApi(page);
  await login(page);

  await buttonWithVisibleText(page, 'Partida rápida').click();
  await page.getByRole('button', { name: 'Empezar partida', exact: true }).click();
  await expect(gameTurn(page)).toBeVisible();
  await open3DFromAppearance(page);

  const board3d = page.locator('[data-board3d-war-room="true"]');
  const shell = page.locator('.board3d-main-shell');
  const liveRow = page.locator('.board-live-row.is-3d-warroom');
  const command = page.locator('.game-3d-command-column');
  const turnPill = page.locator('.game-3d-turn-pill');

  await expect(board3d).toBeVisible({ timeout: 30_000 });
  await expect(shell).toBeVisible();
  await expect(command).toBeVisible();
  await expect(turnPill).toBeVisible();
  await expect(turnPill).toContainText('Matthias');
  await expect(turnPill).toContainText(/CPU nivel \d+/i);
  await expect(turnPill.locator('.game-3d-turn-pill-light')).toBeVisible();

  // Recheck after the deferred 3D CSS/chunk has had time to settle. This is the
  // regression for the pill flashing for a moment and then disappearing.
  await page.waitForTimeout(1200);
  await expect(turnPill).toBeVisible();

  const geometry = await page.evaluate(() => {
    const shellEl = document.querySelector('.board3d-main-shell');
    const rowEl = document.querySelector('.board-live-row.is-3d-warroom');
    const commandEl = document.querySelector('.game-3d-command-column');
    const shellRect = shellEl?.getBoundingClientRect();
    const rowRect = rowEl?.getBoundingClientRect();
    const commandRect = commandEl?.getBoundingClientRect();
    return {
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight,
      coarsePointer: window.matchMedia('(pointer: coarse)').matches,
      landscapeMedia: window.matchMedia('(orientation: landscape)').matches,
      shell: shellRect ? { width: shellRect.width, height: shellRect.height } : null,
      row: rowRect ? { width: rowRect.width, height: rowRect.height } : null,
      command: commandRect ? { width: commandRect.width, height: commandRect.height } : null,
      gridColumns: rowEl ? getComputedStyle(rowEl).gridTemplateColumns : '',
      overflowX: document.documentElement.scrollWidth - window.innerWidth,
    };
  });

  expect(geometry.viewportWidth).toBeGreaterThan(geometry.viewportHeight);
  expect(geometry.coarsePointer).toBe(true);
  expect(geometry.landscapeMedia).toBe(true);
  expect(geometry.viewportWidth).toBeLessThanOrEqual(920);
  expect(geometry.shell).not.toBeNull();
  expect(geometry.row).not.toBeNull();
  expect(geometry.command).not.toBeNull();
  expect(geometry.shell.width / Math.max(1, geometry.shell.height)).toBeGreaterThan(1.5);
  expect(geometry.shell.width).toBeGreaterThan(geometry.viewportWidth * 0.66);
  expect(geometry.command.width).toBeLessThan(200);
  expect(geometry.gridColumns.split(' ').length).toBeGreaterThanOrEqual(2);
  expect(geometry.overflowX).toBeLessThanOrEqual(1);

  // The old narrative card is retired entirely; landscape must not reserve or
  // restyle a hidden ghost node for it.
  await expect(page.locator('.game-3d-warroom-message')).toHaveCount(0);

  await expect(liveRow).toBeVisible();
});

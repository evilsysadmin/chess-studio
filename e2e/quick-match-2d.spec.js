import { expect, test } from '@playwright/test';
import { buttonWithVisibleText, clickBoardMove, login, mockApi } from './helpers.js';

test.use({ reducedMotion: 'reduce' });

const DEVICE_BOARD_RENDERER_KEY = 'chess-study-device-board-renderer-v1';
const PIECE_SKIN_KEY = 'chess-study-selected-skin';

async function openQuickMatch(page) {
  await buttonWithVisibleText(page, 'Partida rápida').click();
  const dialog = page.getByRole('dialog', { name: 'Configurar partida rápida' });
  await expect(dialog).toBeVisible();
  const renderer = dialog.getByRole('group', { name: 'Tipo de tablero' });
  await expect(renderer.getByRole('button', { name: '3D', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(renderer.getByRole('button', { name: '2D', exact: true })).toHaveAttribute('aria-pressed', 'false');
  return { dialog, renderer };
}

async function launchQuickMatch2D(page) {
  const { dialog, renderer } = await openQuickMatch(page);
  await renderer.getByRole('button', { name: '2D', exact: true }).click();
  await expect(renderer.getByRole('button', { name: '2D', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await dialog.getByRole('button', { name: 'Empezar partida', exact: true }).click();
}

async function expectLightweight2D(page) {
  await expect(page.getByRole('group', { name: /Tablero de ajedrez/ })).toBeVisible();
  await expect(page.locator('[data-board3d-war-room="true"]')).toHaveCount(0);
  await expect(page.locator('.game-layout-3d')).toHaveCount(0);
}

test('Partida rápida · 2D entra directo al tablero ligero con Pixel medieval por defecto', async ({ page }) => {
  await mockApi(page);
  await login(page);
  await page.evaluate((key) => localStorage.removeItem(key), PIECE_SKIN_KEY);
  await launchQuickMatch2D(page);

  await expectLightweight2D(page);
  await expect(page.locator('.board-wrap.piece-skin-default')).toBeVisible();
});

test('Partida rápida · 2D no expone PGN ni una franja avanzada', async ({ page }) => {
  await mockApi(page);
  await login(page);
  await launchQuickMatch2D(page);
  await expectLightweight2D(page);

  await expect(page.getByRole('heading', { name: 'Chess Studio', exact: true })).toHaveCount(0);
  await expect(page.locator('.player-status-bar')).toHaveCount(0);
  await expect(page.locator('.square-coordinate')).toHaveCount(16);
  await expect(page.locator('.rank-labels, .file-labels')).toHaveCount(0);
  await expect(page.getByText('Opciones avanzadas', { exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Exportar archivo .pgn', exact: true })).toHaveCount(0);
});

test('Partida rápida · 2D persiste tras F5 en el mismo dispositivo', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 780 });
  await mockApi(page);
  await login(page);
  await launchQuickMatch2D(page);
  await expectLightweight2D(page);

  await expect.poll(() => page.evaluate((key) => localStorage.getItem(key), DEVICE_BOARD_RENDERER_KEY)).toBe('2d');

  await page.reload({ waitUntil: 'domcontentloaded' });

  await expectLightweight2D(page);
  await expect(page.getByText('Restaurando partida en curso…', { exact: true })).toHaveCount(0);
  await expect(buttonWithVisibleText(page, 'Partida rápida')).toHaveCount(0);
  expect(await page.evaluate((key) => localStorage.getItem(key), DEVICE_BOARD_RENDERER_KEY)).toBe('2d');
});

test('Partida rápida · 2D llega a mate y postpartida sin montar War Room', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 780 });
  await mockApi(page, { gameScenario: 'mate' });
  await login(page);
  await launchQuickMatch2D(page);
  await expectLightweight2D(page);

  await clickBoardMove(page, 'g6', 'g7');

  const endgame = page.getByRole('dialog').filter({ has: page.getByRole('heading', { name: 'Jaque mate', exact: true }) });
  await expect(endgame).toBeVisible();
  await expect(endgame.getByText('¡Ganaste la partida!', { exact: true })).toBeVisible();
  await expect(page.locator('[data-board3d-war-room="true"]')).toHaveCount(0);
  await expect(page.locator('.game-layout-3d')).toHaveCount(0);
  await expect(page.locator('.error-boundary-screen')).toHaveCount(0);
  expect(await page.evaluate((key) => localStorage.getItem(key), DEVICE_BOARD_RENDERER_KEY)).toBe('2d');
});

test('Partida rápida · un dispositivo limpio conserva War Room como camino principal', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await mockApi(page);
  await login(page);

  expect(await page.evaluate((key) => localStorage.getItem(key), DEVICE_BOARD_RENDERER_KEY)).toBeNull();
  const { dialog } = await openQuickMatch(page);
  const start = dialog.getByRole('button', { name: 'Empezar partida', exact: true });
  await expect(start).toBeEnabled();
  await start.evaluate((element) => element.click());

  await expect(page.locator('[data-board3d-war-room="true"]')).toBeVisible({ timeout: 30_000 });
  await expect(page.locator('.game-layout-3d')).toBeVisible();
  expect(await page.evaluate((key) => localStorage.getItem(key), DEVICE_BOARD_RENDERER_KEY)).toBe('3d');
});

test('Partida rápida · vuelve a ofrecer 3D aunque el dispositivo recuerde una partida 2D', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await mockApi(page);
  await login(page);
  await page.evaluate((key) => localStorage.setItem(key, '2d'), DEVICE_BOARD_RENDERER_KEY);

  const { dialog } = await openQuickMatch(page);
  const start = dialog.getByRole('button', { name: 'Empezar partida', exact: true });
  await expect(start).toBeEnabled();
  await start.evaluate((element) => element.click());

  await expect(page.locator('[data-board3d-war-room="true"]')).toBeVisible({ timeout: 30_000 });
  await expect(page.locator('.game-layout-3d')).toBeVisible();
  expect(await page.evaluate((key) => localStorage.getItem(key), DEVICE_BOARD_RENDERER_KEY)).toBe('3d');
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

test('Accesibilidad · 2D mantiene teclado y nombres útiles para lector de pantalla', async ({ page }) => {
  await mockApi(page);
  await login(page);
  await launchQuickMatch2D(page);
  await expectLightweight2D(page);

  const board = page.getByRole('group', { name: /Tablero de ajedrez/ }).first();
  await expect(board).toHaveAccessibleName(/Usa las flechas para recorrer casillas y Enter o espacio para seleccionar/);

  const squares = board.locator('.square[role="button"]');
  await expect(squares).toHaveCount(64);
  expect(await squares.evaluateAll((nodes) => nodes.filter((node) => node.tabIndex === 0).length)).toBe(1);

  const e2 = board.getByRole('button', { name: /^Casilla e2, peón blanco/i });
  const e3 = board.getByRole('button', { name: /^Casilla e3, vacía/i });
  await expect(e2).toHaveAccessibleName(/^Casilla e2, peón blanco/i);
  await expect(e3).toHaveAccessibleName(/^Casilla e3, vacía/i);

  await e2.focus();
  await page.keyboard.press('Enter');
  await expect(e2).toHaveAccessibleName(/seleccionada/i);

  await page.keyboard.press('ArrowUp');
  await expect.poll(() => page.evaluate(() => document.activeElement?.getAttribute('aria-label') || ''))
    .toMatch(/^Casilla e3, vacía/i);
  await expect(e3).toHaveAttribute('tabindex', '0');
  expect(await squares.evaluateAll((nodes) => nodes.filter((node) => node.tabIndex === 0).length)).toBe(1);
});

test('Accesibilidad · 2D conserva foco y estados tácticos en forced-colors', async ({ page }) => {
  await page.emulateMedia({ forcedColors: 'active' });
  await mockApi(page);
  await login(page);
  await launchQuickMatch2D(page);
  await expectLightweight2D(page);

  const board = page.getByRole('group', { name: /Tablero de ajedrez/ }).first();
  const e2 = board.getByRole('button', { name: /^Casilla e2, peón blanco/i });
  const e3 = board.getByRole('button', { name: /^Casilla e3, vacía/i });

  await e2.focus();
  await page.keyboard.press('Enter');
  await expect(e2).toHaveClass(/selected/);
  await expect(e3).toHaveClass(/legal-move/);

  const state = await page.evaluate(() => {
    const selected = document.querySelector('.board-grid .square.selected');
    const legal = document.querySelector('.board-grid .square.legal-move');
    if (!selected || !legal) return null;
    const focus = getComputedStyle(selected);
    const selectedMark = getComputedStyle(selected, '::after');
    const legalMark = getComputedStyle(legal, '::before');
    return {
      focusOutlineStyle: focus.outlineStyle,
      focusOutlineWidth: Number.parseFloat(focus.outlineWidth),
      selectedBorderStyle: selectedMark.borderTopStyle,
      selectedBorderWidth: Number.parseFloat(selectedMark.borderTopWidth),
      legalBorderStyle: legalMark.borderTopStyle,
      legalBackground: legalMark.backgroundColor,
    };
  });

  expect(state).not.toBeNull();
  expect(state.focusOutlineStyle).toBe('solid');
  expect(state.focusOutlineWidth).toBeGreaterThanOrEqual(2);
  expect(state.selectedBorderStyle).toBe('solid');
  expect(state.selectedBorderWidth).toBeGreaterThanOrEqual(2);
  expect(state.legalBorderStyle).toBe('solid');
  expect(['transparent', 'rgba(0, 0, 0, 0)']).not.toContain(state.legalBackground);
});

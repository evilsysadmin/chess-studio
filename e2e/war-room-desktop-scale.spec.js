import { expect, test } from '@playwright/test';
import { buttonWithVisibleText, gameTurn, login, mockApi } from './helpers.js';

async function openDesktopWarRoom(page) {
  await page.setViewportSize({ width: 1440, height: 960 });
  await mockApi(page);
  await login(page);

  await buttonWithVisibleText(page, 'Partida rápida').click();
  await page.getByRole('button', { name: 'Empezar partida', exact: true }).click();
  await expect(gameTurn(page)).toBeVisible();

  await page.getByRole('button', { name: 'Cambiar apariencia y piezas del tablero', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Ajustes' });
  await expect(dialog).toBeVisible();
  await dialog.getByRole('radio', { name: /3D$/ }).click();
  await dialog.getByRole('button', { name: 'Cerrar', exact: true }).click();

  const warRoom = page.locator('.board-live-row.is-3d-warroom');
  const shell = page.locator('.board3d-main-shell');
  await expect(warRoom).toBeVisible({ timeout: 45_000 });
  await expect(shell).toBeVisible({ timeout: 45_000 });
  return { warRoom, shell };
}

test('War Room · desktop dedica el salón al tablero y atraca el chat bajo Matthias', async ({ page }) => {
  test.setTimeout(90_000);
  const { warRoom, shell } = await openDesktopWarRoom(page);

  const geometry = await page.evaluate(() => {
    const room = document.querySelector('.board-live-row.is-3d-warroom')?.getBoundingClientRect();
    const board = document.querySelector('.board3d-main-shell')?.getBoundingClientRect();
    const commander = document.querySelector('.game-3d-command-column')?.getBoundingClientRect();
    const chat = document.querySelector('.game-side-column-3d .game-chat')?.getBoundingClientRect();
    const music = document.querySelector('.game-side-column-3d .game-side-music')?.getBoundingClientRect();
    const notation = document.querySelector('.game-side-column-3d .game-notation-disclosure')?.getBoundingClientRect();
    if (!room || !board || !commander || !chat || !music || !notation) return null;
    return {
      roomWidth: room.width,
      boardLeft: board.left,
      boardRight: board.right,
      boardWidth: board.width,
      boardHeight: board.height,
      commanderLeft: commander.left,
      commanderRight: commander.right,
      commanderBottom: commander.bottom,
      commanderWidth: commander.width,
      chatLeft: chat.left,
      chatRight: chat.right,
      chatTop: chat.top,
      chatWidth: chat.width,
      musicLeft: music.left,
      musicWidth: music.width,
      notationLeft: notation.left,
      notationWidth: notation.width,
      documentWidth: document.documentElement.scrollWidth,
      viewportWidth: window.innerWidth,
    };
  });

  expect(geometry).not.toBeNull();
  expect(geometry.boardWidth).toBeGreaterThan(920);
  expect(geometry.boardHeight).toBeGreaterThan(830);
  expect(geometry.boardWidth / geometry.roomWidth).toBeGreaterThan(.63);
  expect(geometry.commanderWidth).toBeGreaterThan(180);
  expect(geometry.chatWidth).toBeGreaterThan(180);
  expect(Math.abs(geometry.chatLeft - geometry.commanderLeft)).toBeLessThan(4);
  expect(geometry.chatRight).toBeLessThanOrEqual(geometry.boardLeft - 2);
  expect(geometry.chatTop).toBeGreaterThanOrEqual(geometry.commanderBottom - 4);
  expect(geometry.musicLeft).toBeGreaterThanOrEqual(geometry.boardRight + 2);
  expect(geometry.notationLeft).toBeGreaterThanOrEqual(geometry.boardRight + 2);
  expect(geometry.musicWidth).toBeGreaterThan(190);
  expect(geometry.notationWidth).toBeGreaterThan(190);
  expect(geometry.documentWidth).toBeLessThanOrEqual(geometry.viewportWidth + 1);

  await expect(warRoom).toBeVisible();
  await expect(shell).toBeVisible();
});

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

test('War Room · desktop dedica el salón al tablero y atraca chat/cuaderno en sus rails', async ({ page }) => {
  test.setTimeout(90_000);
  const { warRoom, shell } = await openDesktopWarRoom(page);

  const geometry = await page.evaluate(() => {
    const roomNode = document.querySelector('.board-live-row.is-3d-warroom');
    const boardNode = document.querySelector('.board3d-main-shell');
    const commanderNode = document.querySelector('.game-3d-command-column');
    const chatNode = document.querySelector('.game-side-column-3d .game-chat');
    const chatLogNode = document.querySelector('.game-side-column-3d .game-chat-log');
    const musicNode = document.querySelector('.game-side-column-3d .game-side-music');
    const notationNode = document.querySelector('.game-side-column-3d .game-notation-disclosure');
    const room = roomNode?.getBoundingClientRect();
    const board = boardNode?.getBoundingClientRect();
    const commander = commanderNode?.getBoundingClientRect();
    const chat = chatNode?.getBoundingClientRect();
    const music = musicNode?.getBoundingClientRect();
    const notation = notationNode?.getBoundingClientRect();
    if (!room || !board || !commander || !chat || !music || !notation || !chatLogNode || !notationNode) return null;
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
      chatHeight: chat.height,
      chatWidth: chat.width,
      chatLogOverflowY: getComputedStyle(chatLogNode).overflowY,
      musicLeft: music.left,
      musicBottom: music.bottom,
      musicWidth: music.width,
      notationLeft: notation.left,
      notationTop: notation.top,
      notationHeight: notation.height,
      notationWidth: notation.width,
      notationOverflowY: getComputedStyle(notationNode).overflowY,
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
  expect(geometry.chatHeight).toBeLessThanOrEqual(361);
  expect(geometry.chatLogOverflowY).toBe('auto');
  expect(geometry.musicLeft).toBeGreaterThanOrEqual(geometry.boardRight + 2);
  expect(geometry.notationLeft).toBeGreaterThanOrEqual(geometry.boardRight + 2);
  expect(geometry.musicWidth).toBeGreaterThan(190);
  expect(geometry.notationWidth).toBeGreaterThan(190);
  // The notebook belongs immediately below RetroPlayer; Matthias' tall card
  // on the opposite rail must no longer push it towards the bottom.
  expect(geometry.notationTop).toBeGreaterThanOrEqual(geometry.musicBottom - 4);
  expect(geometry.notationTop - geometry.musicBottom).toBeLessThan(20);
  expect(geometry.notationHeight).toBeLessThanOrEqual(621);
  expect(geometry.notationOverflowY).toBe('auto');
  expect(geometry.documentWidth).toBeLessThanOrEqual(geometry.viewportWidth + 1);

  await expect(warRoom).toBeVisible();
  await expect(shell).toBeVisible();
});

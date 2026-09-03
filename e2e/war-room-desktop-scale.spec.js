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

test('War Room · desktop dedica el salón al tablero y ordena Matthias → situación → chat', async ({ page }) => {
  test.setTimeout(90_000);
  const { warRoom, shell } = await openDesktopWarRoom(page);

  const geometry = await page.evaluate(() => {
    const roomNode = document.querySelector('.board-live-row.is-3d-warroom');
    const boardNode = document.querySelector('.board3d-main-shell');
    const commanderNode = document.querySelector('.game-3d-command-column');
    const matthiasCardNode = document.querySelector('.game-3d-command-column .game-3d-matthias-card');
    const statusNode = document.querySelector('.game-3d-command-column .game-3d-warroom-status');
    const chatNode = document.querySelector('.game-3d-command-column .game-chat');
    const chatLogNode = document.querySelector('.game-3d-command-column .game-chat-log');
    const chatTitleNode = document.querySelector('.game-3d-command-column .game-chat-heading h3');
    const musicNode = document.querySelector('.game-side-column-3d .game-side-music');
    const notationNode = document.querySelector('.game-side-column-3d .game-notation-disclosure');
    const room = roomNode?.getBoundingClientRect();
    const board = boardNode?.getBoundingClientRect();
    const commander = commanderNode?.getBoundingClientRect();
    const matthiasCard = matthiasCardNode?.getBoundingClientRect();
    const status = statusNode?.getBoundingClientRect();
    const chat = chatNode?.getBoundingClientRect();
    const music = musicNode?.getBoundingClientRect();
    const notation = notationNode?.getBoundingClientRect();
    if (!room || !board || !commander || !matthiasCard || !status || !chat || !music || !notation || !chatLogNode || !chatTitleNode || !notationNode) return null;
    const commanderChildren = [...commanderNode.children];
    return {
      roomWidth: room.width,
      boardLeft: board.left,
      boardRight: board.right,
      boardWidth: board.width,
      boardHeight: board.height,
      commanderLeft: commander.left,
      commanderBottom: commander.bottom,
      commanderWidth: commander.width,
      matthiasCardLeft: matthiasCard.left,
      matthiasCardBottom: matthiasCard.bottom,
      statusTop: status.top,
      statusBottom: status.bottom,
      chatLeft: chat.left,
      chatRight: chat.right,
      chatTop: chat.top,
      chatBottom: chat.bottom,
      chatHeight: chat.height,
      chatWidth: chat.width,
      chatOwnedByCommander: chatNode.parentElement === commanderNode,
      matthiasIndex: commanderChildren.indexOf(matthiasCardNode),
      statusIndex: commanderChildren.indexOf(statusNode),
      chatIndex: commanderChildren.indexOf(chatNode),
      quotePresent: Boolean(commanderNode.querySelector('blockquote')),
      chatLogOverflowY: getComputedStyle(chatLogNode).overflowY,
      chatTitleWhiteSpace: getComputedStyle(chatTitleNode).whiteSpace,
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
  expect(geometry.chatOwnedByCommander).toBe(true);
  expect(geometry.matthiasIndex).toBe(0);
  expect(geometry.statusIndex).toBe(1);
  expect(geometry.chatIndex).toBe(2);
  expect(geometry.quotePresent).toBe(false);

  expect(Math.abs(geometry.chatLeft - geometry.matthiasCardLeft)).toBeLessThan(4);
  expect(geometry.statusTop).toBeGreaterThanOrEqual(geometry.matthiasCardBottom - 4);
  expect(geometry.statusTop - geometry.matthiasCardBottom).toBeLessThan(20);
  expect(geometry.chatTop).toBeGreaterThanOrEqual(geometry.statusBottom - 4);
  expect(geometry.chatTop - geometry.statusBottom).toBeLessThan(20);
  expect(geometry.chatRight).toBeLessThanOrEqual(geometry.boardLeft - 2);
  expect(geometry.chatHeight).toBeGreaterThan(250);
  expect(geometry.commanderBottom - geometry.chatBottom).toBeLessThan(20);
  expect(geometry.chatLogOverflowY).toBe('auto');
  expect(geometry.chatTitleWhiteSpace).toBe('nowrap');

  expect(geometry.musicLeft).toBeGreaterThanOrEqual(geometry.boardRight + 2);
  expect(geometry.notationLeft).toBeGreaterThanOrEqual(geometry.boardRight + 2);
  expect(geometry.musicWidth).toBeGreaterThan(190);
  expect(geometry.notationWidth).toBeGreaterThan(190);
  expect(geometry.notationTop).toBeGreaterThanOrEqual(geometry.musicBottom - 4);
  expect(geometry.notationTop - geometry.musicBottom).toBeLessThan(20);
  expect(geometry.notationHeight).toBeLessThanOrEqual(621);
  expect(geometry.notationOverflowY).toBe('auto');
  expect(geometry.documentWidth).toBeLessThanOrEqual(geometry.viewportWidth + 1);

  await expect(warRoom).toBeVisible();
  await expect(shell).toBeVisible();
});
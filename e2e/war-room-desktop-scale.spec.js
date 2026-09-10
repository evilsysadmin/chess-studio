import { expect, test } from '@playwright/test';
import { buttonWithVisibleText, login, mockApi } from './helpers.js';

async function openDesktopWarRoom(page) {
  await page.setViewportSize({ width: 1440, height: 960 });
  await mockApi(page);
  await login(page);

  await buttonWithVisibleText(page, 'Partida rápida').click();
  await page.getByRole('button', { name: 'Empezar partida', exact: true }).click();

  const warRoom = page.locator('.board-live-row.is-3d-warroom');
  const shell = page.locator('.board3d-main-shell');
  await expect(warRoom).toBeVisible({ timeout: 45_000 });
  await expect(shell).toBeVisible({ timeout: 45_000 });
  return { warRoom, shell };
}

test('War Room · desktop prioriza el tablero, deja el borde inferior limpio y concentra estado en el rail', async ({ page }) => {
  test.setTimeout(90_000);
  const { warRoom, shell } = await openDesktopWarRoom(page);

  const matthiasTab = page.getByRole('button', { name: 'Matthias', exact: true });
  const notebookTab = page.getByRole('button', { name: 'Cuaderno', exact: true });
  const capturesTab = page.getByRole('button', { name: 'Capturas', exact: true });
  const turnPill = page.locator('.game-3d-command-column .game-3d-turn-pill');

  await expect(matthiasTab).toHaveAttribute('aria-pressed', 'true');
  await expect(notebookTab).toHaveAttribute('aria-pressed', 'false');
  await expect(capturesTab).toHaveAttribute('aria-pressed', 'false');
  await expect(turnPill).toBeVisible();
  await expect(turnPill).toContainText('Matthias');
  await expect(turnPill).toContainText(/CPU nivel \d+/i);
  await expect(page.getByRole('button', { name: 'Más acciones de partida', exact: true })).toBeVisible();

  // Board3D is lazy. Recheck once its deferred CSS has settled: the right-rail
  // status must remain visible and the retired bottom chrome must stay retired.
  await page.waitForTimeout(1500);
  await expect(turnPill).toBeVisible();

  const initialGeometry = await page.evaluate(() => {
    const roomNode = document.querySelector('.board-live-row.is-3d-warroom');
    const boardNode = document.querySelector('.board3d-main-shell');
    const boardStackNode = document.querySelector('.game-board-stack.game-board-stack-3d');
    const commanderNode = document.querySelector('.game-3d-command-column');
    const turnPillNode = document.querySelector('.game-3d-command-column .game-3d-turn-pill');
    const controlsNode = document.querySelector('.game-3d-command-column .game-3d-warroom-controls');
    const humanRailNode = document.querySelector('.game-board-stack-3d > .game-player-rail.is-human');
    const commandDeckNode = document.querySelector('.game-board-stack-3d > .game-command-deck');
    const musicNode = document.querySelector('.game-side-column-3d .game-side-music');
    const railNode = document.querySelector('.game-side-column-3d .game-warroom-rail');
    const chatNode = document.querySelector('.game-warroom-rail .game-chat');
    const chatLogNode = document.querySelector('.game-warroom-rail .game-chat-log');
    const room = roomNode?.getBoundingClientRect();
    const board = boardNode?.getBoundingClientRect();
    const commander = commanderNode?.getBoundingClientRect();
    const turnPillRect = turnPillNode?.getBoundingClientRect();
    const music = musicNode?.getBoundingClientRect();
    const rail = railNode?.getBoundingClientRect();
    const chat = chatNode?.getBoundingClientRect();
    if (!room || !board || !boardStackNode || !commander || !turnPillRect || !controlsNode || !humanRailNode || !commandDeckNode || !music || !rail || !chat || !chatLogNode) return null;
    return {
      roomLeft: room.left,
      roomRight: room.right,
      roomWidth: room.width,
      boardLeft: board.left,
      boardRight: board.right,
      boardWidth: board.width,
      boardHeight: board.height,
      commanderLeft: commander.left,
      commanderRight: commander.right,
      commanderBottom: commander.bottom,
      commanderWidth: commander.width,
      turnPillLeft: turnPillRect.left,
      turnPillRight: turnPillRect.right,
      turnPillWidth: turnPillRect.width,
      controlsDisplay: getComputedStyle(controlsNode).display,
      humanRailDisplay: getComputedStyle(humanRailNode).display,
      commandDeckDisplay: getComputedStyle(commandDeckNode).display,
      musicLeft: music.left,
      musicTop: music.top,
      musicBottom: music.bottom,
      musicWidth: music.width,
      railLeft: rail.left,
      railTop: rail.top,
      railWidth: rail.width,
      chatWidth: chat.width,
      chatOwnedByRail: chatNode.closest('.game-warroom-rail') === railNode,
      commanderHasChat: Boolean(commanderNode.querySelector('.game-chat')),
      chatLogOverflowY: getComputedStyle(chatLogNode).overflowY,
      documentWidth: document.documentElement.scrollWidth,
      viewportWidth: window.innerWidth,
    };
  });

  expect(initialGeometry).not.toBeNull();
  expect(initialGeometry.boardWidth).toBeGreaterThan(820);
  expect(initialGeometry.boardHeight).toBeGreaterThan(830);
  expect(initialGeometry.boardWidth / initialGeometry.roomWidth).toBeGreaterThan(.72);
  expect(initialGeometry.boardLeft - initialGeometry.roomLeft).toBeLessThan(24);

  // The match HUD now belongs to the right rail, not to the board artwork.
  expect(initialGeometry.commanderLeft).toBeGreaterThanOrEqual(initialGeometry.boardRight - 2);
  expect(initialGeometry.commanderRight).toBeLessThanOrEqual(initialGeometry.roomRight + 2);
  expect(initialGeometry.commanderWidth).toBeGreaterThan(190);
  expect(initialGeometry.turnPillWidth).toBeGreaterThan(190);
  expect(initialGeometry.turnPillLeft).toBeGreaterThanOrEqual(initialGeometry.commanderLeft - 2);
  expect(initialGeometry.turnPillRight).toBeLessThanOrEqual(initialGeometry.commanderRight + 2);
  expect(Math.abs(initialGeometry.commanderLeft - initialGeometry.musicLeft)).toBeLessThan(4);
  expect(initialGeometry.musicTop).toBeGreaterThanOrEqual(initialGeometry.commanderBottom - 4);
  expect(initialGeometry.musicTop - initialGeometry.commanderBottom).toBeLessThan(20);

  // Nothing from the match-command UI is allowed to survive on the lower apron.
  expect(initialGeometry.humanRailDisplay).toBe('none');
  expect(initialGeometry.commandDeckDisplay).toBe('none');
  expect(initialGeometry.controlsDisplay).toBe('none');

  expect(initialGeometry.chatWidth).toBeGreaterThan(190);
  expect(initialGeometry.chatOwnedByRail).toBe(true);
  expect(initialGeometry.commanderHasChat).toBe(false);
  expect(initialGeometry.chatLogOverflowY).toBe('auto');
  expect(initialGeometry.musicLeft).toBeGreaterThanOrEqual(initialGeometry.boardRight - 2);
  expect(initialGeometry.railLeft).toBeGreaterThanOrEqual(initialGeometry.boardRight - 2);
  expect(initialGeometry.musicWidth).toBeGreaterThan(190);
  expect(initialGeometry.railWidth).toBeGreaterThan(190);
  expect(initialGeometry.railTop).toBeGreaterThanOrEqual(initialGeometry.musicBottom - 4);
  expect(initialGeometry.railTop - initialGeometry.musicBottom).toBeLessThan(20);
  expect(initialGeometry.documentWidth).toBeLessThanOrEqual(initialGeometry.viewportWidth + 1);

  await notebookTab.click();
  await expect(notebookTab).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('.game-warroom-rail-panel.is-notebook')).toBeVisible();
  await expect(page.locator('.game-notation-compact-preview')).toBeVisible();
  await expect(page.locator('.game-warroom-rail .game-chat')).toHaveCount(0);

  const notebookGeometry = await page.evaluate(() => {
    const railNode = document.querySelector('.game-warroom-rail');
    const panelNode = document.querySelector('.game-warroom-rail-panel.is-notebook');
    const emptyNode = document.querySelector('.game-notation-compact-empty');
    const rail = railNode?.getBoundingClientRect();
    const panel = panelNode?.getBoundingClientRect();
    if (!rail || !panel || !emptyNode) return null;
    const channels = getComputedStyle(emptyNode).color.match(/[\d.]+/g)?.slice(0, 3).map(Number) || [];
    return {
      panelWidth: panel.width,
      railWidth: rail.width,
      panelHeight: panel.height,
      bodyColourSum: channels.reduce((sum, value) => sum + value, 0),
    };
  });

  expect(notebookGeometry).not.toBeNull();
  expect(Math.abs(notebookGeometry.panelWidth - notebookGeometry.railWidth)).toBeLessThan(4);
  expect(notebookGeometry.panelHeight).toBeLessThanOrEqual(391);
  expect(notebookGeometry.bodyColourSum).toBeGreaterThan(480);

  await capturesTab.click();
  await expect(capturesTab).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('.game-warroom-captures')).toBeVisible();
  await expect(page.getByText('Sin capturas todavía.', { exact: true })).toBeVisible();
  await expect(page.locator('.game-notation-compact-preview')).toHaveCount(0);

  await expect(warRoom).toBeVisible();
  await expect(shell).toBeVisible();
});
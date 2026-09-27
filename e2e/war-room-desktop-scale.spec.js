import { expect, test } from '@playwright/test';
import { activateSetupControl, buttonWithVisibleText, login, mockApi } from './helpers.js';

async function openDesktopWarRoom(page) {
  await page.setViewportSize({ width: 1440, height: 960 });
  await mockApi(page);
  await login(page);

  await buttonWithVisibleText(page, 'Partida rápida').click();
  await activateSetupControl(page.getByRole('button', { name: 'Empezar partida', exact: true }));

  const warRoom = page.locator('.board-live-row.is-3d-warroom');
  const shell = page.locator('.board3d-main-shell');
  await expect(warRoom).toBeVisible({ timeout: 45_000 });
  await expect(shell).toBeVisible({ timeout: 45_000 });
  return { warRoom, shell };
}

test('War Room · desktop usa inmersión única con tablero protagonista y HUD flotante', async ({ page }) => {
  test.setTimeout(90_000);
  const { warRoom, shell } = await openDesktopWarRoom(page);

  const layout = page.locator('.game-layout-3d');
  const turnPill = page.locator('.game-3d-command-column .game-3d-turn-pill');
  const utility = page.getByRole('button', { name: 'Más acciones de partida', exact: true });

  await expect(layout).toHaveClass(/game-layout-immersive/);
  await expect(layout).toHaveAttribute('data-war-room-immersive', 'true');
  await expect(page.locator('body')).toHaveClass(/war-room-immersive-active/);
  await expect(turnPill).toBeVisible();
  await expect(turnPill).toContainText('Matthias');
  await expect(utility).toBeVisible();

  await expect(page.locator('.game-side-column.game-side-column-3d')).toBeHidden();
  await expect(page.locator('.game-board-stack-3d > .game-player-rail.is-human')).toBeHidden();
  await expect(page.locator('.game-board-stack-3d > .game-command-deck')).toBeHidden();

  await page.waitForTimeout(1200);

  const geometry = await page.evaluate(() => {
    const layoutNode = document.querySelector('.game-layout-3d');
    const roomNode = document.querySelector('.board-live-row.is-3d-warroom');
    const boardNode = document.querySelector('.board3d-main-shell');
    const pillNode = document.querySelector('.game-3d-turn-pill');
    if (!layoutNode || !roomNode || !boardNode || !pillNode) return null;
    const layoutRect = layoutNode.getBoundingClientRect();
    const roomRect = roomNode.getBoundingClientRect();
    const boardRect = boardNode.getBoundingClientRect();
    const pillRect = pillNode.getBoundingClientRect();
    return {
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight,
      documentWidth: document.documentElement.scrollWidth,
      documentHeight: document.documentElement.scrollHeight,
      layout: { left: layoutRect.left, top: layoutRect.top, right: layoutRect.right, bottom: layoutRect.bottom },
      room: { left: roomRect.left, top: roomRect.top, right: roomRect.right, bottom: roomRect.bottom },
      board: { left: boardRect.left, top: boardRect.top, right: boardRect.right, bottom: boardRect.bottom, width: boardRect.width, height: boardRect.height },
      pill: { left: pillRect.left, top: pillRect.top, right: pillRect.right, bottom: pillRect.bottom },
    };
  });

  expect(geometry).not.toBeNull();
  expect(Math.abs(geometry.layout.left)).toBeLessThanOrEqual(1);
  expect(Math.abs(geometry.layout.top)).toBeLessThanOrEqual(1);
  expect(Math.abs(geometry.layout.right - geometry.viewportWidth)).toBeLessThanOrEqual(1);
  expect(Math.abs(geometry.layout.bottom - geometry.viewportHeight)).toBeLessThanOrEqual(1);

  expect(geometry.board.width).toBeGreaterThan(1000);
  expect(geometry.board.height).toBeGreaterThan(700);
  expect(geometry.board.left).toBeLessThanOrEqual(2);
  expect(geometry.board.top).toBeLessThanOrEqual(2);
  expect(geometry.board.right).toBeGreaterThanOrEqual(geometry.viewportWidth - 2);
  expect(geometry.board.bottom).toBeGreaterThanOrEqual(geometry.viewportHeight - 2);

  expect(geometry.pill.top).toBeGreaterThanOrEqual(0);
  expect(geometry.pill.bottom).toBeLessThanOrEqual(geometry.viewportHeight);
  expect(geometry.pill.left).toBeGreaterThanOrEqual(0);
  expect(geometry.pill.right).toBeLessThanOrEqual(geometry.viewportWidth);

  expect(geometry.documentWidth).toBeLessThanOrEqual(geometry.viewportWidth + 1);
  expect(geometry.documentHeight).toBeLessThanOrEqual(geometry.viewportHeight + 1);

  await expect(warRoom).toBeVisible();
  await expect(shell).toBeVisible();
});

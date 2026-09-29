import { expect, test } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { buttonWithVisibleText, login, mockApi } from './helpers.js';

const ARTIFACT_DIR = '../.artifacts/app-visual/pvp-duel-room';
const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

function matchPayload() {
  return {
    id: 'pvp-duel-visual-1',
    white: 'e2e',
    black: 'bob',
    whiteRating: 1050,
    blackRating: 1210,
    fen: START_FEN,
    turn: 'w',
    status: 'active',
    result: null,
    history: [],
    revision: 0,
    youAre: 'w',
    yourTurn: true,
    createdAt: '2026-09-29T05:00:00Z',
    updatedAt: '2026-09-29T05:00:00Z',
    opponentPresence: 'online',
    clock: { id: '10+0', whiteMs: 600000, blackMs: 600000, incrementMs: 0, runningColor: 'w' },
  };
}

async function openDuelRoom(page, viewport) {
  await page.setViewportSize(viewport);
  await mockApi(page);

  const match = matchPayload();
  await page.route('**/api/pvp/lobby', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({
      roster: [
        { username: 'e2e', rating: 1050, tier: 'Intermedio', isSelf: true },
        { username: 'bob', rating: 1210, tier: 'Intermedio', isSelf: false },
      ],
      challenges: [{
        id: 'challenge-pvp-duel-visual',
        challenger: 'bob',
        opponent: 'e2e',
        challengerRating: 1210,
        opponentRating: 1050,
        status: 'pending',
        direction: 'incoming',
      }],
      activeMatch: null,
      pollAfterMs: 3000,
    }),
  }));
  await page.route('**/api/pvp/challenges/challenge-pvp-duel-visual/accept', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ match }),
  }));
  await page.route('**/api/pvp/matches/pvp-duel-visual-1', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ match, pollAfterMs: 5000 }),
  }));

  await login(page);
  await buttonWithVisibleText(page, 'Partida rápida').click();
  await page.getByRole('button', { name: /Jugar contra una persona/ }).click();

  const lobby = page.getByRole('dialog', { name: 'Duelo 1 contra 1 · War Room' });
  await expect(lobby).toBeVisible();
  await lobby.getByRole('button', { name: 'Aceptar', exact: true }).click();

  const room = page.getByRole('region', { name: 'Sala de duelo 1 contra 1' });
  await expect(room).toBeVisible();
  const board = room.locator('[data-board3d-war-room="true"]');
  const canvas = board.locator('.board3d-main-canvas');
  await expect(canvas).toBeVisible({ timeout: 45_000 });
  await expect(canvas).toHaveAttribute('data-war-room-variant', 'duel', { timeout: 60_000 });
  await expect(canvas).toHaveAttribute('data-war-room-variant-status', 'ready', { timeout: 60_000 });
  await expect(canvas).toHaveAttribute('data-board3d-piece-built', '32', { timeout: 45_000 });

  const [roomBox, boardBox] = await Promise.all([room.boundingBox(), board.boundingBox()]);
  expect(roomBox).not.toBeNull();
  expect(boardBox).not.toBeNull();
  expect(boardBox.width / roomBox.width).toBeGreaterThan(0.72);
  expect(Math.abs((boardBox.x + boardBox.width / 2) - (roomBox.x + roomBox.width / 2)) / roomBox.width)
    .toBeLessThan(0.12);

  await page.waitForTimeout(900);
  await mkdir(ARTIFACT_DIR, { recursive: true });

  const horizontal = await page.evaluate(() => {
    const root = document.documentElement;
    const viewportWidth = root.clientWidth;
    const offenders = [...document.querySelectorAll('body *')]
      .map((element) => {
        const rect = element.getBoundingClientRect();
        return {
          tag: element.tagName,
          className: typeof element.className === 'string' ? element.className.slice(0, 120) : '',
          left: Math.round(rect.left),
          right: Math.round(rect.right),
          width: Math.round(rect.width),
        };
      })
      .filter(({ left, right }) => left < -1 || right > viewportWidth + 1)
      .slice(0, 8);
    return { overflow: root.scrollWidth - viewportWidth, offenders };
  });
  expect(
    horizontal.overflow,
    'horizontal overflow offenders: ' + JSON.stringify(horizontal.offenders),
  ).toBeLessThanOrEqual(1);
  return { room, board, canvas };
}

async function assertMobileTouchTargets(room) {
  const topbarButton = room.page().locator('.pvp-war-room__topbar button').first();
  const utility = room.locator('.pvp-war-room__duel-pill .game-3d-utility-menu>summary');
  for (const target of [topbarButton, utility]) {
    const box = await target.boundingBox();
    expect(box).not.toBeNull();
    expect(box.width).toBeGreaterThanOrEqual(44);
    expect(box.height).toBeGreaterThanOrEqual(44);
  }
}

test('PvP Duel Room · runtime desktop visual artifact', async ({ page }) => {
  test.setTimeout(120_000);
  const { room } = await openDuelRoom(page, { width: 1440, height: 900 });
  await room.screenshot({
    path: ARTIFACT_DIR + '/pvp-duel-room-desktop-1440x900.png',
    animations: 'disabled',
  });
});

test('PvP Duel Room · runtime Android portrait visual artifact', async ({ page }) => {
  test.setTimeout(120_000);
  const { room } = await openDuelRoom(page, { width: 390, height: 844 });
  await assertMobileTouchTargets(room);
  await room.screenshot({
    path: ARTIFACT_DIR + '/pvp-duel-room-android-390x844.png',
    animations: 'disabled',
  });
});

test('PvP Duel Room · runtime Android landscape visual artifact', async ({ page }) => {
  test.setTimeout(120_000);
  const { room } = await openDuelRoom(page, { width: 844, height: 390 });
  await assertMobileTouchTargets(room);
  const verticalOverflow = await page.evaluate(
    () => document.documentElement.scrollHeight - document.documentElement.clientHeight,
  );
  expect(verticalOverflow).toBeLessThanOrEqual(1);
  await room.screenshot({
    path: ARTIFACT_DIR + '/pvp-duel-room-android-landscape-844x390.png',
    animations: 'disabled',
  });
});

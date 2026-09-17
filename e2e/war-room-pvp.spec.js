import { expect, test } from '@playwright/test';
import { buttonWithVisibleText, login, mockApi } from './helpers.js';

const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

function matchPayload() {
  return {
    id: 'pvp-e2e-1',
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
    createdAt: '2026-09-16T05:00:00Z',
    updatedAt: '2026-09-16T05:00:00Z',
    clock: { id: '10+0', whiteMs: 600000, blackMs: 600000, incrementMs: 0, runningColor: 'w' },
  };
}

test('War Room 1v1 · reto entrante abre una partida humana en el tablero canónico', async ({ page }) => {
  test.setTimeout(90_000);
  await mockApi(page);

  await page.route('**/api/pvp/lobby', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({
      roster: [
        { username: 'e2e', rating: 1050, tier: 'Intermedio', isSelf: true },
        { username: 'bob', rating: 1210, tier: 'Intermedio', isSelf: false },
      ],
      challenges: [{
        id: 'challenge-e2e-1',
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
  await page.route('**/api/pvp/challenges/challenge-e2e-1/accept', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ match: matchPayload() }),
  }));
  await page.route('**/api/pvp/matches/pvp-e2e-1', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ match: matchPayload(), pollAfterMs: 1250 }),
  }));

  await login(page);
  await buttonWithVisibleText(page, 'Partida rápida').click();
  await page.getByRole('button', { name: /Jugar contra una persona/ }).click();

  const lobby = page.getByRole('dialog', { name: 'Duelo 1 contra 1 · War Room' });
  await expect(lobby).toBeVisible();
  await expect(lobby.getByText('bob', { exact: true }).first()).toBeVisible();
  await lobby.getByRole('button', { name: 'Aceptar', exact: true }).click();

  const warRoom = page.getByRole('region', { name: 'War Room 1 contra 1' });
  await expect(warRoom).toBeVisible();
  await expect(warRoom.getByText('bob', { exact: true })).toBeVisible();
  await expect(warRoom.getByText('Tu turno', { exact: true })).toBeVisible();
  await expect(warRoom.getByText('10:00', { exact: true }).first()).toBeVisible();
  const actions = warRoom.getByRole('button', { name: 'Más acciones de partida', exact: true });
  await expect(actions).toBeVisible();
  await actions.click();
  await expect(warRoom.getByRole('menuitem', { name: 'Abandonar partida', exact: true })).toBeVisible();

  const board = page.locator('[data-board3d-war-room="true"]');
  await expect(board).toBeVisible({ timeout: 45_000 });

  // A visible shell is not enough: the regression that prompted this guard
  // left the War Room chrome mounted while the actual duel was effectively
  // stranded in the canonical side rail. Require a live canvas, the complete
  // starting army and a board that still owns the PvP room horizontally.
  const canvas = board.locator('.board3d-main-canvas');
  await expect(canvas).toBeVisible({ timeout: 45_000 });
  await expect(canvas).toHaveAttribute('data-board3d-piece-built', '32', { timeout: 45_000 });

  const [roomBox, boardBox] = await Promise.all([warRoom.boundingBox(), board.boundingBox()]);
  expect(roomBox).not.toBeNull();
  expect(boardBox).not.toBeNull();
  expect(boardBox.width / roomBox.width).toBeGreaterThan(0.72);
  const roomCenter = roomBox.x + roomBox.width / 2;
  const boardCenter = boardBox.x + boardBox.width / 2;
  expect(Math.abs(boardCenter - roomCenter) / roomBox.width).toBeLessThan(0.12);
});

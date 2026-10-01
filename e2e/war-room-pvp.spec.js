import { expect, test } from '@playwright/test';
import { buttonWithVisibleText, login, mockApi } from './helpers.js';
import { clickWarRoomMove } from './war-room-board-input.js';

const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

function matchPayload(overrides = {}) {
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
    ...overrides,
  };
}

test('War Room 1v1 · un 409 por carrera de turno sincroniza sin flash de error', async ({ page }) => {
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
        id: 'challenge-race-1',
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

  let liveMatch = matchPayload();
  let moveAttempts = 0;
  await page.route('**/api/pvp/challenges/challenge-race-1/accept', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ match: liveMatch }),
  }));
  await page.route('**/api/pvp/matches/pvp-e2e-1', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ match: liveMatch, pollAfterMs: 1250 }),
  }));
  await page.route('**/api/pvp/matches/pvp-e2e-1/move', async (route) => {
    moveAttempts += 1;
    liveMatch = matchPayload({
      turn: 'b',
      yourTurn: false,
      revision: 1,
      fen: 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1',
      history: [{ ply: 1, uci: 'e2e4', san: 'e4', by: 'bob' }],
      clock: { id: '10+0', whiteMs: 599500, blackMs: 600000, incrementMs: 0, runningColor: 'b' },
    });
    await route.fulfill({
      status: 409,
      contentType: 'application/json',
      body: JSON.stringify({ detail: 'No es tu turno.' }),
    });
  });

  await login(page);
  await buttonWithVisibleText(page, 'Partida rápida').click();
  await page.getByRole('button', { name: /Jugar contra una persona/ }).click();
  const lobby = page.getByRole('dialog', { name: 'Duelo 1 contra 1 · War Room' });
  await lobby.getByRole('button', { name: 'Aceptar', exact: true }).click();

  const warRoom = page.getByRole('region', { name: 'Sala de duelo 1 contra 1' });
  await expect(warRoom.getByText('Tu turno', { exact: true })).toBeVisible({ timeout: 45_000 });
  await expect(clickWarRoomMove(page, 'e2', 'e4')).resolves.toBe(true);

  await expect.poll(() => moveAttempts).toBe(1);
  await expect(warRoom.getByText('bob juega', { exact: true })).toBeVisible({ timeout: 5_000 });
  await expect(warRoom.getByRole('alert')).toHaveCount(0);
});

test('War Room 1v1 · rendirse no resucita un handoff stale del lobby', async ({ page }) => {
  test.setTimeout(90_000);
  await mockApi(page);

  const staleStarting = matchPayload({
    black: 'sparringmeister',
    blackRating: 400,
    status: 'starting',
    yourTurn: false,
    youReady: false,
    opponentReady: true,
    startsAt: null,
    opponentPresence: 'online',
    clock: { id: '10+0', whiteMs: 600000, blackMs: 600000, incrementMs: 0, runningColor: null },
  });
  let liveMatch = matchPayload({
    black: 'sparringmeister',
    blackRating: 400,
    status: 'active',
    youReady: true,
    opponentReady: true,
    startsAt: '2026-09-16T04:59:59Z',
    opponentPresence: 'online',
  });

  // Keep returning the stale pre-game snapshot from the roster on purpose.
  // This is the exact state that used to resurrect the handoff after resigning.
  await page.route('**/api/pvp/lobby', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({
      roster: [
        { username: 'e2e', rating: 1050, tier: 'Intermedio', isSelf: true },
        { username: 'sparringmeister', rating: 400, tier: 'Principiante', isSelf: false },
      ],
      challenges: [],
      activeMatch: staleStarting,
      messages: [],
      pollAfterMs: 3000,
    }),
  }));
  await page.route('**/api/pvp/roster', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ member: { username: 'e2e', rating: 1050, tier: 'Intermedio', isSelf: true } }),
  }));
  await page.route('**/api/pvp/matches/pvp-e2e-1/ready', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ match: liveMatch }),
  }));
  await page.route('**/api/pvp/matches/pvp-e2e-1', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ match: liveMatch, pollAfterMs: 1250 }),
  }));
  await page.route('**/api/pvp/matches/pvp-e2e-1/move', (route) => {
    liveMatch = matchPayload({
      black: 'sparringmeister',
      blackRating: 400,
      status: 'active',
      startsAt: '2026-09-16T04:59:59Z',
      opponentPresence: 'online',
      turn: 'b',
      yourTurn: false,
      revision: 1,
      fen: 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1',
      history: [{ ply: 1, uci: 'e2e4', san: 'e4', by: 'e2e' }],
      clock: { id: '10+0', whiteMs: 599500, blackMs: 600000, incrementMs: 0, runningColor: 'b' },
    });
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ match: liveMatch }),
    });
  });
  await page.route('**/api/pvp/matches/pvp-e2e-1/resign', (route) => {
    liveMatch = {
      ...liveMatch,
      status: 'finished',
      result: '0-1',
      endReason: 'resignation',
      yourTurn: false,
      revision: 2,
      ratingChange: null,
      clock: { ...liveMatch.clock, runningColor: null },
    };
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ match: liveMatch }),
    });
  });

  await login(page);
  // Explicit login deliberately clears ephemeral PvP enrollment so one account
  // cannot inherit another account's roster state. Recreate the real persisted
  // session shape after authentication, then reload like a returning player.
  await page.evaluate(() => {
    sessionStorage.setItem('chess-study-pvp-enrollment-v1', JSON.stringify({ username: 'e2e', enrolled: true }));
  });
  await page.reload();
  await expect(page.getByRole('region', { name: 'Modos principales', exact: true })).toBeVisible();

  const warRoom = page.getByRole('region', { name: 'Sala de duelo 1 contra 1' });
  await expect(warRoom).toBeVisible({ timeout: 15_000 });
  await expect(warRoom.getByText('Tu turno', { exact: true })).toBeVisible({ timeout: 45_000 });
  await expect(clickWarRoomMove(page, 'e2', 'e4')).resolves.toBe(true);
  await expect(warRoom.getByText('sparringmeister juega', { exact: true })).toBeVisible({ timeout: 5_000 });

  await warRoom.getByRole('button', { name: 'Más acciones de partida', exact: true }).click();
  await warRoom.getByRole('menuitem', { name: 'Abandonar partida', exact: true }).click();
  const resignDialog = page.getByRole('dialog', { name: '¿Abandonar la partida?' });
  await expect(resignDialog).toBeVisible();
  await resignDialog.getByRole('button', { name: 'Rendirse', exact: true }).click();

  const debrief = warRoom.getByRole('dialog', { name: 'Resumen del duelo' });
  await expect(debrief).toBeVisible({ timeout: 5_000 });
  await expect(debrief).toContainText('Derrota');
  await debrief.getByRole('button', { name: 'Volver al lobby', exact: true }).click();

  await expect(page.getByRole('region', { name: 'Modos principales', exact: true })).toBeVisible();
  await expect(page.getByText('Sincronizando el duelo…', { exact: true })).toHaveCount(0);
  await page.waitForTimeout(1200);
  await expect(page.getByText('Sincronizando el duelo…', { exact: true })).toHaveCount(0);
});

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
  let liveMatch = matchPayload();
  await page.route('**/api/pvp/challenges/challenge-e2e-1/accept', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ match: liveMatch }),
  }));
  await page.route('**/api/pvp/matches/pvp-e2e-1', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ match: liveMatch, pollAfterMs: 1250 }),
  }));

  await login(page);
  await buttonWithVisibleText(page, 'Partida rápida').click();
  await page.getByRole('button', { name: /Jugar contra una persona/ }).click();

  const lobby = page.getByRole('dialog', { name: 'Duelo 1 contra 1 · War Room' });
  await expect(lobby).toBeVisible();
  await expect(lobby.getByText('bob', { exact: true }).first()).toBeVisible();
  await lobby.getByRole('button', { name: 'Aceptar', exact: true }).click();

  const warRoom = page.getByRole('region', { name: 'Sala de duelo 1 contra 1' });
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
  await expect(canvas).toHaveAttribute('data-war-room-variant', 'duel', { timeout: 60_000 });
  await expect(canvas).toHaveAttribute('data-war-room-variant-status', 'ready', { timeout: 60_000 });
  await expect(canvas).toHaveAttribute('data-board3d-piece-built', '32', { timeout: 45_000 });

  const [roomBox, boardBox] = await Promise.all([warRoom.boundingBox(), board.boundingBox()]);
  expect(roomBox).not.toBeNull();
  expect(boardBox).not.toBeNull();
  expect(boardBox.width / roomBox.width).toBeGreaterThan(0.72);
  const roomCenter = roomBox.x + roomBox.width / 2;
  const boardCenter = boardBox.x + boardBox.width / 2;
  expect(Math.abs(boardCenter - roomCenter) / roomBox.width).toBeLessThan(0.12);

  liveMatch = matchPayload({
    status: 'finished',
    result: '0-1',
    endReason: 'timeout',
    yourTurn: false,
    revision: 1,
    history: [
      { ply: 1, uci: 'e2e4', san: 'e4', by: 'e2e' },
      { ply: 2, uci: 'e7e5', san: 'e5', by: 'bob' },
    ],
    clock: { id: '10+0', whiteMs: 0, blackMs: 584000, incrementMs: 0, runningColor: null },
  });

  const debrief = warRoom.getByRole('dialog', { name: 'Resumen del duelo' });
  await expect(debrief).toBeVisible({ timeout: 5_000 });
  await expect(debrief).toContainText('MATTHIAS // DEBRIEF 1 VS 1');
  await expect(debrief).toContainText('Derrota');
  await expect(debrief).toContainText('Perdiste por tiempo');
  await expect(debrief).toContainText('Contra bob · 1210 rating · Tiempo · 2 jugadas registradas');
  await expect(debrief.getByRole('button', { name: 'Volver al lobby' })).toBeVisible();
});

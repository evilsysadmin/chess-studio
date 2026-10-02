import { expect, test } from '@playwright/test';
import { login, mockApi } from './helpers.js';
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
    clock: { id: '30+0', whiteMs: 1800000, blackMs: 1800000, incrementMs: 0, runningColor: 'w' },
    ...overrides,
  };
}

function matchPulsePayload(match) {
  return {
    revision: match.revision,
    status: match.status,
    lifecycleDue: false,
    opponentPresence: match.opponentPresence || 'online',
    pollAfterMs: 1250,
    source: 'go',
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
  await page.route('**/api/pvp/matches/pvp-e2e-1/pulse', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify(matchPulsePayload(liveMatch)),
  }));
  await page.route('**/api/pvp/matches/pvp-e2e-1/move', async (route) => {
    moveAttempts += 1;
    liveMatch = matchPayload({
      turn: 'b',
      yourTurn: false,
      revision: 1,
      fen: 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1',
      history: [{ ply: 1, uci: 'e2e4', san: 'e4', by: 'bob' }],
      clock: { id: '30+0', whiteMs: 1799500, blackMs: 1800000, incrementMs: 0, runningColor: 'b' },
    });
    await route.fulfill({
      status: 409,
      contentType: 'application/json',
      body: JSON.stringify({ detail: 'No es tu turno.' }),
    });
  });

  await login(page);
  await page.getByRole('button', { name: 'Abrir Sala de Duelos 1 contra 1' }).click();
  const lobby = page.getByRole('dialog', { name: 'Duelo 1 contra 1 · War Room' });
  await lobby.getByRole('button', { name: 'Aceptar', exact: true }).click();

  const warRoom = page.getByRole('region', { name: 'Sala de duelo 1 contra 1' });
  await expect(warRoom.getByText('Tu turno', { exact: true })).toBeVisible({ timeout: 45_000 });
  await expect(clickWarRoomMove(page, 'e2', 'e4')).resolves.toBe(true);

  await expect.poll(() => moveAttempts).toBe(1);
  await expect(warRoom.getByText('bob juega', { exact: true })).toBeVisible({ timeout: 10_000 });
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
    clock: { id: '30+0', whiteMs: 1800000, blackMs: 1800000, incrementMs: 0, runningColor: null },
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
  let staleActiveAfterResign = null;
  let duelFinished = false;
  let postExitLobbyReads = 0;
  let lobbyPulseRevision = 0;

  // Force every visible lobby poll to reconcile the full snapshot so this test
  // can model a real blue/green ordering race deterministically.
  await page.route('**/api/pvp/lobby/pulse', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({
      revision: `pvp-e2e-${++lobbyPulseRevision}`,
      pollAfterMs: 2000,
      source: 'go',
    }),
  }));

  // Before the duel finishes the roster advertises the starting match. After
  // "Volver al lobby", return one transient null snapshot and then a delayed
  // stale active snapshot for the same match. That exact null -> stale-active
  // ordering used to clear the terminal guard and reopen Duel Room.
  await page.route('**/api/pvp/lobby', (route) => {
    let activeMatch = staleStarting;
    if (duelFinished) {
      activeMatch = postExitLobbyReads === 0 ? null : staleActiveAfterResign;
      postExitLobbyReads += 1;
    }
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        roster: [
          { username: 'e2e', rating: 1050, tier: 'Intermedio', isSelf: true },
          { username: 'sparringmeister', rating: 400, tier: 'Principiante', isSelf: false },
        ],
        challenges: [],
        activeMatch,
        messages: [],
        pollAfterMs: 2000,
      }),
    });
  });
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
  await page.route('**/api/pvp/matches/pvp-e2e-1/pulse', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify(matchPulsePayload(liveMatch)),
  }));
  let moveAttempts = 0;
  await page.route('**/api/pvp/matches/pvp-e2e-1/move', (route) => {
    moveAttempts += 1;
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
      clock: { id: '30+0', whiteMs: 1799500, blackMs: 1800000, incrementMs: 0, runningColor: 'b' },
    });
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ match: liveMatch }),
    });
  });
  await page.route('**/api/pvp/matches/pvp-e2e-1/resign', (route) => {
    staleActiveAfterResign = { ...liveMatch };
    duelFinished = true;
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
  await expect(warRoom).toBeVisible({ timeout: 25_000 });
  await expect(warRoom.getByText('Tu turno', { exact: true })).toBeVisible({ timeout: 45_000 });
  await expect(clickWarRoomMove(page, 'e2', 'e4')).resolves.toBe(true);
  await expect.poll(() => moveAttempts).toBe(1);
  await expect(warRoom.getByText('sparringmeister juega', { exact: true })).toBeVisible({ timeout: 10_000 });

  await expect(warRoom.getByRole('button', { name: 'Salir de la partida', exact: true })).toBeVisible();
  await expect(warRoom.getByRole('button', { name: 'Lobby', exact: true })).toHaveCount(0);
  await warRoom.getByRole('button', { name: 'Salir de la partida', exact: true }).click();
  const resignDialog = page.getByRole('dialog', { name: '¿Abandonar la partida?' });
  await expect(resignDialog).toBeVisible();
  await expect(resignDialog).toContainText('Para volver al lobby durante un duelo debes rendirte.');
  await resignDialog.getByRole('button', { name: 'Rendirse', exact: true }).click();

  const debrief = warRoom.getByRole('dialog', { name: 'Resumen del duelo' });
  await expect(debrief).toBeVisible({ timeout: 5_000 });
  await expect(debrief).toContainText('Derrota');
  await debrief.getByRole('button', { name: 'Volver al lobby', exact: true }).click();

  await expect(page.getByRole('region', { name: 'Modos principales', exact: true })).toBeVisible();
  await expect(page.getByText('Sincronizando el duelo…', { exact: true })).toHaveCount(0);

  // First full lobby read is null; the following poll deliberately returns the
  // stale active snapshot. The finished duel must stay buried instead of
  // reopening a room whose "Abandonar" action can no longer mutate anything.
  await expect.poll(() => postExitLobbyReads, { timeout: 8_000 }).toBeGreaterThanOrEqual(2);
  await expect(page.getByRole('region', { name: 'Sala de duelo 1 contra 1' })).toHaveCount(0);
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
  await page.getByRole('button', { name: 'Abrir Sala de Duelos 1 contra 1' }).click();

  const lobby = page.getByRole('dialog', { name: 'Duelo 1 contra 1 · War Room' });
  await expect(lobby).toBeVisible();
  await expect(lobby.getByText('bob', { exact: true }).first()).toBeVisible();
  await lobby.getByRole('button', { name: 'Aceptar', exact: true }).click();

  const warRoom = page.getByRole('region', { name: 'Sala de duelo 1 contra 1' });
  await expect(warRoom).toBeVisible();
  await expect(warRoom.getByRole('strong').filter({ hasText: /^bob$/ })).toBeVisible();
  await expect(warRoom.getByText('Tu turno', { exact: true })).toBeVisible();
  await expect(warRoom.getByText('30:00', { exact: true }).first()).toBeVisible();
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
    clock: { id: '30+0', whiteMs: 0, blackMs: 1784000, incrementMs: 0, runningColor: null },
  });

  const debrief = warRoom.getByRole('dialog', { name: 'Resumen del duelo' });
  await expect(debrief).toBeVisible({ timeout: 5_000 });
  await expect(debrief).toContainText('MATTHIAS // DEBRIEF 1 VS 1');
  await expect(debrief).toContainText('Derrota');
  await expect(debrief).toContainText('Perdiste por tiempo');
  await expect(debrief).toContainText('Contra bob · 1210 rating · Tiempo · 2 jugadas registradas');
  await expect(debrief.getByRole('button', { name: 'Volver al lobby' })).toBeVisible();

  const verdict = debrief.locator('.pvp-war-room__result-verdict');
  const [roomBoxAfter, debriefBox, verdictBox] = await Promise.all([
    warRoom.boundingBox(),
    debrief.boundingBox(),
    verdict.boundingBox(),
  ]);
  expect(roomBoxAfter).not.toBeNull();
  expect(debriefBox).not.toBeNull();
  expect(verdictBox).not.toBeNull();
  const roomCenterAfter = {
    x: roomBoxAfter.x + roomBoxAfter.width / 2,
    y: roomBoxAfter.y + roomBoxAfter.height / 2,
  };
  const debriefCenter = {
    x: debriefBox.x + debriefBox.width / 2,
    y: debriefBox.y + debriefBox.height / 2,
  };
  expect(Math.abs(debriefCenter.x - roomCenterAfter.x) / roomBoxAfter.width).toBeLessThan(0.06);
  expect(Math.abs(debriefCenter.y - roomCenterAfter.y) / roomBoxAfter.height).toBeLessThan(0.12);
  expect(debriefBox.width / roomBoxAfter.width).toBeGreaterThan(0.4);
  expect(verdictBox.width / debriefBox.width).toBeGreaterThan(0.7);
});

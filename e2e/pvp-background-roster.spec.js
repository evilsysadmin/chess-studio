import { expect, test } from '@playwright/test';
import { buttonWithHeading, login, mockApi } from './helpers.js';

const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

function matchPayload({ status = 'active', startsAt = null, ...overrides } = {}) {
  return {
    id: 'pvp-global-1',
    white: 'e2e',
    black: 'bob',
    whiteRating: 1050,
    blackRating: 1210,
    fen: START_FEN,
    turn: 'w',
    status,
    result: null,
    history: [],
    revision: 0,
    youAre: 'w',
    yourTurn: true,
    createdAt: '2026-09-18T00:00:00Z',
    updatedAt: '2026-09-18T00:00:00Z',
    startsAt,
    opponentPresence: 'online',
    opponentSeenAt: new Date().toISOString(),
    opponentDisconnectDeadline: null,
    clock: { id: '10+0', whiteMs: 600000, blackMs: 600000, incrementMs: 0, runningColor: status === 'active' && startsAt && Date.parse(startsAt) <= Date.now() ? 'w' : null },
    ...overrides,
  };
}

async function setVisibility(page, state) {
  await page.evaluate((nextState) => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => nextState });
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => nextState !== 'visible' });
    document.dispatchEvent(new Event('visibilitychange'));
  }, state);
}

test('1v1 · enrolado sigue disponible fuera del roster y un reto global hace handoff a War Room', async ({ page, context }) => {
  test.setTimeout(90_000);
  await mockApi(page);

  let enrolled = false;
  let challengeReady = false;
  let accepted = false;
  let synchronized = false;
  let startsAt = null;
  let matchReads = 0;
  let authoritativeOverrides = {};
  const challenge = {
    id: 'challenge-global-1',
    challenger: 'bob',
    opponent: 'e2e',
    challengerRating: 1210,
    opponentRating: 1050,
    status: 'pending',
    direction: 'incoming',
  };

  await page.route('**/api/pvp/roster', async (route) => {
    if (route.request().method() === 'POST') {
      enrolled = true;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ member: { username: 'e2e', rating: 1050, tier: 'Intermedio', isSelf: true } }),
      });
      return;
    }
    if (route.request().method() === 'DELETE') {
      enrolled = false;
      await route.fulfill({ status: 204, body: '' });
      return;
    }
    await route.fallback();
  });

  await page.route('**/api/pvp/lobby', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({
      roster: enrolled ? [
        { username: 'e2e', rating: 1050, tier: 'Intermedio', isSelf: true },
        { username: 'bob', rating: 1210, tier: 'Intermedio', isSelf: false },
      ] : [],
      challenges: enrolled && challengeReady ? [challenge] : [],
      activeMatch: accepted
        ? matchPayload({ status: synchronized ? 'active' : 'starting', startsAt })
        : null,
      pollAfterMs: 500,
    }),
  }));

  await page.route('**/api/pvp/challenges/challenge-global-1/accept', (route) => {
    accepted = true;
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ match: matchPayload({ status: 'starting' }) }),
    });
  });
  await page.route('**/api/pvp/matches/pvp-global-1/ready', (route) => {
    synchronized = true;
    startsAt = new Date(Date.now() + 5000).toISOString();
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ match: matchPayload({ status: 'active', startsAt }) }),
    });
  });
  await page.route('**/api/pvp/matches/pvp-global-1', (route) => {
    matchReads += 1;
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        match: matchPayload({ status: synchronized ? 'active' : 'starting', startsAt, ...authoritativeOverrides }),
        pollAfterMs: 500,
      }),
    });
  });

  await login(page);

  const rosterLink = page.getByRole('button', { name: 'Abrir rivales 1 contra 1 de War Room' });
  await rosterLink.click();
  const lobby = page.getByRole('dialog', { name: 'Duelo 1 contra 1 · War Room' });
  await lobby.getByRole('button', { name: 'Ponerme disponible', exact: true }).click();
  await expect(lobby.getByText('DISPONIBLE PARA RETOS', { exact: true })).toBeVisible();
  await lobby.getByRole('button', { name: 'Cerrar', exact: true }).click();

  await expect(rosterLink.getByText('Rivales disponibles', { exact: true })).toBeVisible();
  await expect(rosterLink.getByText('ELEGIR', { exact: true })).toBeVisible();
  challengeReady = true;

  await buttonWithHeading(page, 'Torneo').click();
  await expect(page.getByRole('heading', { name: 'Siguiente rival', exact: true })).toBeVisible();

  const nudge = page.getByLabel('Reto 1 contra 1 de bob');
  await expect(nudge).toBeVisible({ timeout: 8_000 });
  await nudge.getByRole('button', { name: 'Aceptar', exact: true }).click();

  const handoff = page.getByRole('dialog', { name: 'Entrando en 1 contra 1' });
  await expect(handoff).toBeVisible();
  await expect(handoff.getByText(/Entrando en 1 vs 1 en 5/)).toBeVisible();
  await expect(handoff.getByText('Tu progreso aquí no se perderá.', { exact: true })).toBeVisible();

  const warRoom = page.getByRole('region', { name: 'War Room 1 contra 1' });
  await expect(warRoom).toBeVisible({ timeout: 20_000 });
  await expect(warRoom.getByText('bob', { exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Siguiente rival', exact: true })).toHaveCount(0);

  await page.reload();
  const restoredWarRoom = page.getByRole('region', { name: 'War Room 1 contra 1' });
  await expect(restoredWarRoom).toBeVisible({ timeout: 12_000 });

  const duelStatus = restoredWarRoom.locator('.pvp-war-room__duel-pill [role="status"]');
  await expect(duelStatus).toHaveText('Tu turno');

  // Background suspends network polling. Returning to foreground must force an
  // immediate authoritative read instead of waiting for the next periodic tick.
  await setVisibility(page, 'hidden');
  await page.waitForTimeout(700);
  const readsWhileHidden = matchReads;
  authoritativeOverrides = { revision: 1, yourTurn: false, turn: 'b' };
  await page.waitForTimeout(700);
  expect(matchReads).toBe(readsWhileHidden);
  await setVisibility(page, 'visible');
  await expect.poll(() => matchReads, { timeout: 1200 }).toBeGreaterThan(readsWhileHidden);
  await expect(duelStatus).toHaveText('bob juega');

  // A real network loss also freezes interaction immediately. When the browser
  // comes online, the next server snapshot wins before the board is usable again.
  await context.setOffline(true);
  await expect.poll(() => page.evaluate(() => navigator.onLine)).toBe(false);
  await expect(duelStatus).toHaveText('Reconectando con el árbitro…');
  const readsBeforeOnline = matchReads;
  authoritativeOverrides = { revision: 2, yourTurn: true, turn: 'w' };
  await context.setOffline(false);
  await expect.poll(() => page.evaluate(() => navigator.onLine)).toBe(true);
  await expect.poll(() => matchReads, { timeout: 1200 }).toBeGreaterThan(readsBeforeOnline);
  await expect(duelStatus).toHaveText('Tu turno');
  await expect(page.locator('.error-boundary-screen')).toHaveCount(0);

  const rivalPresence = restoredWarRoom.locator('.pvp-war-room__opponent-meta em');
  await expect(rivalPresence).toHaveText('EN LÍNEA');

  // Backend arma una gracia factual cuando el rival lleva >12 s ausente. La UI
  // sólo proyecta el deadline; no decide el resultado por su cuenta.
  const readsBeforeGrace = matchReads;
  authoritativeOverrides = {
    revision: 2,
    yourTurn: true,
    turn: 'w',
    opponentPresence: 'disconnected',
    opponentDisconnectDeadline: new Date(Date.now() + 60_000).toISOString(),
  };
  await expect.poll(() => matchReads, { timeout: 1800 }).toBeGreaterThan(readsBeforeGrace);
  await expect(rivalPresence).toHaveText(/SIN CONEXIÓN · \d+ s/);

  // Si vuelve antes del deadline, el mismo snapshot limpia la gracia.
  const readsBeforeRecovery = matchReads;
  authoritativeOverrides = {
    revision: 2,
    yourTurn: true,
    turn: 'w',
    opponentPresence: 'online',
    opponentDisconnectDeadline: null,
  };
  await expect.poll(() => matchReads, { timeout: 1800 }).toBeGreaterThan(readsBeforeRecovery);
  await expect(rivalPresence).toHaveText('EN LÍNEA');

  // Si no vuelve, sólo el servidor cierra el duelo y liquida el resultado.
  const readsBeforeForfeit = matchReads;
  authoritativeOverrides = {
    revision: 3,
    status: 'finished',
    result: '1-0',
    endReason: 'disconnect',
    yourTurn: false,
    opponentPresence: 'disconnected',
    opponentDisconnectDeadline: null,
    ratingChange: { before: 1050, after: 1066, delta: 16 },
  };
  await expect.poll(() => matchReads, { timeout: 1800 }).toBeGreaterThan(readsBeforeForfeit);
  const debrief = restoredWarRoom.getByRole('dialog', { name: 'Resumen del duelo' });
  await expect(debrief).toBeVisible();
  await expect(debrief).toContainText('El rival agotó los 60 s de gracia de reconexión.');
  await expect(debrief).toContainText('Desconexión');
});

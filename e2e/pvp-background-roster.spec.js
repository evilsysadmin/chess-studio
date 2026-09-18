import { expect, test } from '@playwright/test';
import { buttonWithHeading, login, mockApi } from './helpers.js';

const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

function matchPayload({ status = 'active', startsAt = null } = {}) {
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
    clock: { id: '10+0', whiteMs: 600000, blackMs: 600000, incrementMs: 0, runningColor: status === 'active' && startsAt && Date.parse(startsAt) <= Date.now() ? 'w' : null },
  };
}

test('1v1 · enrolado sigue disponible fuera del roster y un reto global hace handoff a War Room', async ({ page }) => {
  test.setTimeout(90_000);
  await mockApi(page);

  let enrolled = false;
  let challengeReady = false;
  let accepted = false;
  let synchronized = false;
  let startsAt = null;
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
  await page.route('**/api/pvp/matches/pvp-global-1', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ match: matchPayload({ status: synchronized ? 'active' : 'starting', startsAt }), pollAfterMs: 500 }),
  }));

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
  await expect(page.getByRole('region', { name: 'War Room 1 contra 1' })).toBeVisible({ timeout: 12_000 });
});

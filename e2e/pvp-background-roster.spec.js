import { expect, test } from '@playwright/test';
import { buttonWithHeading, login, mockApi } from './helpers.js';

const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

function matchPayload() {
  return {
    id: 'pvp-global-1',
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
    createdAt: '2026-09-18T00:00:00Z',
    updatedAt: '2026-09-18T00:00:00Z',
    clock: { id: '10+0', whiteMs: 600000, blackMs: 600000, incrementMs: 0, runningColor: 'w' },
  };
}

test('1v1 · enrolado sigue disponible fuera del roster y un reto global hace handoff a War Room', async ({ page }) => {
  test.setTimeout(90_000);
  await mockApi(page);

  let enrolled = false;
  let challengeReady = false;
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
      activeMatch: null,
      pollAfterMs: 2000,
    }),
  }));

  await page.route('**/api/pvp/challenges/challenge-global-1/accept', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ match: matchPayload() }),
  }));
  await page.route('**/api/pvp/matches/pvp-global-1', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ match: matchPayload(), pollAfterMs: 1250 }),
  }));

  await login(page);

  const rosterLink = page.getByRole('button', { name: 'Abrir roster 1 contra 1 de War Room' });
  await rosterLink.click();
  const lobby = page.getByRole('dialog', { name: 'Duelo 1 contra 1 · War Room' });
  await lobby.getByRole('button', { name: 'Entrar al roster', exact: true }).click();
  await expect(lobby.getByText('EN SERVICIO', { exact: true })).toBeVisible();
  await lobby.getByRole('button', { name: 'Cerrar', exact: true }).click();

  await expect(rosterLink.getByText('En roster', { exact: true })).toBeVisible();
  challengeReady = true;

  await buttonWithHeading(page, 'Torneo').click();
  await expect(page.getByRole('heading', { name: 'Siguiente rival', exact: true })).toBeVisible();

  const nudge = page.getByLabel('Reto 1 contra 1 de bob');
  await expect(nudge).toBeVisible({ timeout: 8_000 });
  await nudge.getByRole('button', { name: 'Aceptar', exact: true }).click();

  const warRoom = page.getByRole('region', { name: 'War Room 1 contra 1' });
  await expect(warRoom).toBeVisible({ timeout: 20_000 });
  await expect(warRoom.getByText('bob', { exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Siguiente rival', exact: true })).toHaveCount(0);
});

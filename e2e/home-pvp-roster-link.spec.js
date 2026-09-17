import { expect, test } from '@playwright/test';
import { buttonWithHeading, login, mockApi } from './helpers.js';

test('Home · el roster 1 vs 1 abre directamente la sala de duelo', async ({ page }) => {
  await mockApi(page);
  await page.route('**/api/pvp/lobby', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ roster: [], challenges: [], activeMatch: null, pollAfterMs: 3000 }),
  }));

  await login(page);

  const rosterLink = page.getByRole('button', { name: 'Abrir roster 1 contra 1 de War Room' });
  await expect(rosterLink).toBeVisible();
  await rosterLink.click();

  const lobby = page.getByRole('dialog', { name: 'Duelo 1 contra 1 · War Room' });
  await expect(lobby).toBeVisible();
  await expect(lobby.getByRole('heading', { name: 'Roster de duelo' })).toBeVisible();
  await expect(rosterLink).toBeHidden();
});


test('1 vs 1 · enrolado sigue disponible fuera del lobby y un reto hace handoff global', async ({ page }) => {
  test.setTimeout(90_000);
  let enrolled = false;
  let challengePending = false;
  const match = {
    id: 'pvp-handoff-1',
    white: 'e2e',
    black: 'bob',
    whiteRating: 1050,
    blackRating: 1210,
    fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
    turn: 'w',
    status: 'active',
    result: null,
    history: [],
    revision: 0,
    youAre: 'w',
    yourTurn: true,
    clock: { id: '10+0', whiteMs: 600000, blackMs: 600000, incrementMs: 0, runningColor: 'w' },
  };

  await mockApi(page);
  await page.route('**/api/pvp/roster', async (route) => {
    if (route.request().method() === 'POST') {
      enrolled = true;
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ member: { username: 'e2e', rating: 1050, tier: 'Intermedio', isSelf: true } }) });
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
      roster: enrolled ? [{ username: 'e2e', rating: 1050, tier: 'Intermedio', isSelf: true }] : [],
      challenges: challengePending ? [{ id: 'c-global', challenger: 'bob', opponent: 'e2e', challengerRating: 1210, opponentRating: 1050, status: 'pending', direction: 'incoming' }] : [],
      activeMatch: null,
      pollAfterMs: 3000,
    }),
  }));
  await page.route('**/api/pvp/challenges/c-global/accept', (route) => route.fulfill({
    status: 200, contentType: 'application/json', body: JSON.stringify({ match }),
  }));
  await page.route('**/api/pvp/matches/pvp-handoff-1', (route) => route.fulfill({
    status: 200, contentType: 'application/json', body: JSON.stringify({ match, pollAfterMs: 1250 }),
  }));

  await login(page);
  const rosterLink = page.getByRole('button', { name: 'Abrir roster 1 contra 1 de War Room' });
  await rosterLink.click();
  const lobby = page.getByRole('dialog', { name: 'Duelo 1 contra 1 · War Room' });
  await lobby.getByRole('button', { name: 'Entrar al roster', exact: true }).click();
  await expect(lobby.getByText('Disponible mientras juegas otros modos', { exact: true })).toBeVisible();
  await lobby.getByRole('button', { name: 'Cerrar', exact: true }).click();
  await expect(rosterLink).toContainText('Disponible para 1 vs 1');

  challengePending = true;
  await buttonWithHeading(page, 'Torneo').click();
  const nudge = page.getByRole('complementary', { name: 'Reto 1 contra 1 recibido' });
  await expect(nudge).toBeVisible({ timeout: 10_000 });
  await nudge.getByRole('button', { name: 'Aceptar', exact: true }).click();

  await expect(page.getByRole('region', { name: 'War Room 1 contra 1' })).toBeVisible({ timeout: 45_000 });
});

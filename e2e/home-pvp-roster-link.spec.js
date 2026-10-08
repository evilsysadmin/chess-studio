import { expect, test } from '@playwright/test';
import { login, mockApi } from './helpers.js';

test('Home · el roster 1 vs 1 abre la sala y puede minimizarse', async ({ page }) => {
  await mockApi(page);
  await page.route('**/api/pvp/lobby', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({
      roster: [{ username: 'evilsysadmin', isSelf: true, rating: 384, tier: 'Principiante' }],
      challenges: [],
      activeMatch: null,
      pollAfterMs: 3000,
    }),
  }));

  await login(page);

  const rosterLink = page.getByRole('button', { name: 'Abrir Sala de Duelos 1 contra 1' });
  await expect(rosterLink).toBeVisible();
  await rosterLink.click();

  const lobby = page.getByRole('dialog', { name: 'Duelo 1 contra 1 · War Room' });
  await expect(lobby).toBeVisible();
  await expect(lobby.getByRole('heading', { name: 'Sala de Duelos' })).toBeVisible();
  await expect(lobby.getByRole('list', { name: 'Cómo jugar 1 contra 1' })).toContainText('Ponte disponible');
  await expect(lobby.getByRole('list', { name: 'Cómo jugar 1 contra 1' })).toContainText('Pulsa Retar');
  await expect(rosterLink).toBeHidden();

  const minimizeButton = lobby.getByRole('button', { name: 'Cerrar y seguir disponible' });
  await expect(minimizeButton).toBeVisible();
  await expect(lobby.getByRole('button', { name: 'Dejar de estar disponible' })).toBeVisible();
  await expect(lobby.getByText('Visible para otros jugadores · puedes cerrar y seguir jugando', { exact: true })).toBeVisible();
  await minimizeButton.click();

  await expect(lobby).toBeHidden();
  await expect(rosterLink).toBeVisible();
  await expect(rosterLink.getByText('Esperando rival', { exact: true })).toBeVisible();
  await expect(rosterLink.getByText('VER SALA', { exact: true })).toBeVisible();
});


test('Roster 1v1 · retar a un rival es una acción directa sin selección intermedia', async ({ page }) => {
  await mockApi(page);
  let challengePosts = 0;
  await page.route('**/api/pvp/lobby', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({
      roster: [
        { username: 'evilsysadmin', isSelf: true, rating: 400, tier: 'Principiante' },
        { username: 'bob', isSelf: false, rating: 416, tier: 'Principiante', headToHead: { games: 2, wins: 1, draws: 0, losses: 1 } },
      ],
      challenges: [],
      activeMatch: null,
      messages: [],
      pollAfterMs: 3000,
    }),
  }));
  await page.route('**/api/pvp/challenges', async (route) => {
    if (route.request().method() !== 'POST') return route.fallback();
    challengePosts += 1;
    return route.fulfill({
      status: 201,
      contentType: 'application/json',
      body: JSON.stringify({ challenge: { id: 'c-out', opponent: 'bob', status: 'pending', direction: 'outgoing' } }),
    });
  });

  await login(page);
  await page.getByRole('button', { name: 'Abrir Sala de Duelos 1 contra 1' }).click();
  const lobby = page.getByRole('dialog', { name: 'Duelo 1 contra 1 · War Room' });
  const bobRow = lobby.locator('.pvp-lobby__player').filter({ hasText: 'bob' });

  await expect(lobby.getByText('RIVAL SELECCIONADO', { exact: true })).toHaveCount(0);
  await expect(bobRow.getByText('VS TI · 1V 0T 1D', { exact: true })).toBeVisible();
  await bobRow.getByRole('button', { name: 'Retar a bob', exact: true }).click();
  await expect.poll(() => challengePosts).toBe(1);
});


test('Roster 1v1 · residente owner-only se muestra con disclosure y reta por username técnico', async ({ page }) => {
  await mockApi(page);
  let challengedOpponent = null;
  await page.route('**/api/pvp/lobby', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({
      roster: [
        { username: 'evilsysadmin', isSelf: true, rating: 400, tier: 'Principiante' },
        {
          username: 'marta_stein',
          displayName: 'Marta Stein',
          actorKind: 'resident',
          actorLabel: 'RESIDENTE · IA',
          isSelf: false,
          rating: 1200,
          tier: 'Intermedio',
        },
      ],
      challenges: [],
      activeMatch: null,
      messages: [],
      pollAfterMs: 3000,
    }),
  }));
  await page.route('**/api/pvp/challenges', async (route) => {
    if (route.request().method() !== 'POST') return route.fallback();
    challengedOpponent = (await route.request().postDataJSON()).opponent;
    return route.fulfill({
      status: 201,
      contentType: 'application/json',
      body: JSON.stringify({
        challenge: { id: 'resident-c1', opponent: 'marta_stein', status: 'accepted', direction: 'outgoing' },
      }),
    });
  });

  await login(page);
  await page.getByRole('button', { name: 'Abrir Sala de Duelos 1 contra 1' }).click();

  const lobby = page.getByRole('dialog', { name: 'Duelo 1 contra 1 · War Room' });
  const row = lobby.locator('.pvp-lobby__player').filter({ hasText: 'Marta Stein' });
  await expect(row.getByText('Marta Stein', { exact: true })).toBeVisible();
  await expect(row.getByText('Intermedio · RESIDENTE · IA', { exact: true })).toBeVisible();
  await expect(row.getByText('1200', { exact: true })).toBeVisible();
  await row.getByRole('button', { name: 'Retar a Marta Stein', exact: true }).click();
  await expect.poll(() => challengedOpponent).toBe('marta_stein');
});


test('Roster 1v1 · un reto saliente con contrato nuevo puede cancelarse', async ({ page }) => {
  await mockApi(page);
  let cancelled = false;

  await page.route('**/api/pvp/lobby', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({
      roster: [
        { username: 'evilsysadmin', isSelf: true, rating: 400, tier: 'Principiante' },
        { username: 'bob', isSelf: false, rating: 416, tier: 'Principiante' },
      ],
      challenges: cancelled ? [] : [{
        id: 'c-out',
        challenger: 'evilsysadmin',
        opponent: 'bob',
        challengerRating: 400,
        opponentRating: 416,
        status: 'pending',
        direction: 'outgoing',
        createdAt: '2099-01-01T10:00:00Z',
        expiresAt: '2099-01-01T10:01:15Z',
        matchId: null,
      }],
      activeMatch: null,
      pollAfterMs: 3000,
    }),
  }));

  await page.route('**/api/pvp/challenges/c-out/cancel', (route) => {
    cancelled = true;
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        challenge: {
          id: 'c-out',
          challenger: 'evilsysadmin',
          opponent: 'bob',
          status: 'cancelled',
          direction: 'outgoing',
          createdAt: '2099-01-01T10:00:00Z',
          expiresAt: '2099-01-01T10:01:15Z',
          resolvedAt: '2099-01-01T10:00:05Z',
        },
      }),
    });
  });

  await login(page);
  await page.getByRole('button', { name: 'Abrir Sala de Duelos 1 contra 1' }).click();

  const lobby = page.getByRole('dialog', { name: 'Duelo 1 contra 1 · War Room' });
  const outgoingChallenge = lobby.locator('.pvp-lobby__challenge').filter({ hasText: 'bob' });
  const cancelButton = outgoingChallenge.getByRole('button', { name: 'Cancelar reto a bob' });
  await expect(outgoingChallenge.getByText('RETO ENVIADO', { exact: true })).toBeVisible();
  await expect(outgoingChallenge.getByText(/caduca/i)).toBeVisible();
  await expect(cancelButton).toBeVisible();

  await cancelButton.click();

  await expect.poll(() => cancelled).toBe(true);
  await expect(outgoingChallenge).toBeHidden();
});


test('Roster 1v1 móvil · abre arriba, sin título amputado ni estado vacío duplicado', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await mockApi(page);
  await page.route('**/api/pvp/lobby', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({
      roster: [{ username: 'evilsysadmin', isSelf: true, rating: 384, tier: 'Principiante' }],
      challenges: [],
      activeMatch: null,
      pollAfterMs: 3000,
    }),
  }));

  await login(page);
  const more = page.locator('.illustrated-home__play-more');
  await expect(page.locator('.home-pvp-roster-link:not(.home-pvp-roster-link--menu)')).toBeHidden();
  await more.click();
  await page.locator('.illustrated-home__play-mobile-pvp').getByRole('button', { name: 'Abrir Sala de Duelos 1 contra 1' }).click();

  const lobby = page.getByRole('dialog', { name: 'Duelo 1 contra 1 · War Room' });
  const heading = lobby.getByRole('heading', { name: 'Sala de Duelos' });
  await expect(heading).toBeVisible();

  const box = await heading.boundingBox();
  expect(box).not.toBeNull();
  expect(box.y).toBeGreaterThanOrEqual(0);
  expect(box.y + box.height).toBeLessThanOrEqual(844);

  await expect(lobby.getByText('Estás disponible.', { exact: true })).toHaveCount(0);
  await expect(lobby.getByRole('button', { name: 'Cerrar y seguir disponible' })).toBeVisible();
  await expect(lobby.getByRole('button', { name: 'Dejar de estar disponible' })).toBeVisible();
});

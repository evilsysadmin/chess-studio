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

  const rosterLink = page.getByRole('button', { name: 'Abrir roster 1 contra 1 de War Room' });
  await expect(rosterLink).toBeVisible();
  await rosterLink.click();

  const lobby = page.getByRole('dialog', { name: 'Duelo 1 contra 1 · War Room' });
  await expect(lobby).toBeVisible();
  await expect(lobby.getByRole('heading', { name: 'Roster de duelo' })).toBeVisible();
  await expect(rosterLink).toBeHidden();

  const minimizeButton = lobby.getByRole('button', { name: 'Minimizar y seguir jugando' });
  await expect(minimizeButton).toBeVisible();
  await expect(lobby.getByRole('button', { name: 'Salir del roster' })).toBeVisible();
  await expect(lobby.getByText('Disponible para retos · puedes minimizar y seguir jugando', { exact: true })).toBeVisible();
  await minimizeButton.click();

  await expect(lobby).toBeHidden();
  await expect(rosterLink).toBeVisible();
  await expect(rosterLink.getByText('En roster', { exact: true })).toBeVisible();
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
  await page.getByRole('button', { name: 'Abrir roster 1 contra 1 de War Room' }).click();

  const lobby = page.getByRole('dialog', { name: 'Duelo 1 contra 1 · War Room' });
  await expect(lobby.getByText('RETO ENVIADO', { exact: true })).toBeVisible();
  await expect(lobby.getByText(/caduca/i)).toBeVisible();

  await lobby.getByRole('button', { name: 'Cancelar reto a bob' }).click();

  await expect.poll(() => cancelled).toBe(true);
  await expect(lobby.getByText('RETO ENVIADO', { exact: true })).toBeHidden();
});

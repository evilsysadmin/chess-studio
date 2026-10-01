import { expect, test } from '@playwright/test';
import { login, mockApi } from './helpers.js';

// On desktop the 1 vs 1 entry lives inside the JUGAR "Más formas de jugar" menu.
async function openPlayMenu(page) {
  const more = page.getByRole('button', { name: /Más formas de jugar/ });
  if ((await more.getAttribute('aria-expanded')) !== 'true') await more.click();
}

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

  await openPlayMenu(page);
  const rosterLink = page.getByRole('button', { name: 'Abrir rivales 1 contra 1 de War Room' });
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
  await openPlayMenu(page);
  await expect(rosterLink).toBeVisible();
  await expect(rosterLink.getByText('Esperando rival', { exact: true })).toBeVisible();
  await expect(rosterLink.getByText('VER SALA', { exact: true })).toBeVisible();
});


test('Roster 1v1 · retar es directo, reto entrante domina y chat queda plegado', async ({ page }) => {
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
      challenges: [{
        id: 'c-in', challenger: 'alice', opponent: 'evilsysadmin', challengerRating: 430,
        status: 'pending', direction: 'incoming', expiresAt: '2099-01-01T10:01:15Z',
      }],
      activeMatch: null,
      messages: [{ id: 'm1', username: 'bob', text: '¿Duelo?', createdAt: new Date().toISOString(), isSelf: false }],
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
  await openPlayMenu(page);
  await page.getByRole('button', { name: 'Abrir rivales 1 contra 1 de War Room' }).click();

  const lobby = page.getByRole('dialog', { name: 'Duelo 1 contra 1 · War Room' });
  const incoming = lobby.getByRole('region', { name: 'Retos entrantes' });
  const roster = lobby.getByRole('heading', { name: '¿A quién retas?' });
  await expect(incoming).toBeVisible();
  await expect(incoming).toContainText('alice');
  const [incomingBox, rosterBox] = await Promise.all([incoming.boundingBox(), roster.boundingBox()]);
  expect(incomingBox?.y).toBeLessThan(rosterBox?.y);

  await expect(lobby.getByText('RIVAL SELECCIONADO', { exact: true })).toHaveCount(0);
  const bobRow = lobby.locator('.pvp-lobby__player').filter({ hasText: 'bob' });
  await expect(bobRow.getByText('VS TI · 1V 0T 1D', { exact: true })).toBeVisible();
  await bobRow.getByRole('button', { name: 'Retar', exact: true }).click();
  await expect.poll(() => challengePosts).toBe(1);

  const chat = lobby.locator('details.pvp-lobby__panel--chat');
  await expect(chat).not.toHaveAttribute('open', '');
  await expect(chat.getByText('1 mensaje', { exact: true })).toBeVisible();
  await expect(chat.getByRole('textbox', { name: 'Mensaje para el chat del lobby' })).toBeHidden();
  await chat.locator('summary').click();
  await expect(chat.getByRole('textbox', { name: 'Mensaje para el chat del lobby' })).toBeVisible();
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
  await openPlayMenu(page);
  await page.getByRole('button', { name: 'Abrir rivales 1 contra 1 de War Room' }).click();

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

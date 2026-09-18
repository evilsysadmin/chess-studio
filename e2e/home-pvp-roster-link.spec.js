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

  const rosterLink = page.getByRole('button', { name: 'Abrir rivales 1 contra 1 de War Room' });
  await expect(rosterLink).toBeVisible();
  await rosterLink.click();

  const lobby = page.getByRole('dialog', { name: 'Duelo 1 contra 1 · War Room' });
  await expect(lobby).toBeVisible();
  await expect(lobby.getByRole('heading', { name: 'Elige rival' })).toBeVisible();
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

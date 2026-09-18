import { expect, test } from '@playwright/test';
import { login, mockApi } from './helpers.js';

test('Home · el roster 1 vs 1 abre la sala y puede minimizarse', async ({ page }) => {
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

  const minimizeButton = lobby.getByRole('button', { name: 'Minimizar roster y seguir jugando' });
  await expect(minimizeButton).toBeVisible();
  await minimizeButton.click();

  await expect(lobby).toBeHidden();
  await expect(rosterLink).toBeVisible();
});

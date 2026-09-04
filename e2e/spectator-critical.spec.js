import { expect, test } from '@playwright/test';
import {
  login,
  mockApi,
  openSpectator,
} from './helpers.js';

test('Espectador · un jaque CPU se ve y marca el rey sin congelar el loop', async ({ page }) => {
  await mockApi(page, {
    analysisMoves: [
      { from: 'e2', to: 'e4' },
      { from: 'd7', to: 'd6' },
      { from: 'f1', to: 'b5' },
      { from: 'c7', to: 'c6' },
    ],
  });
  await login(page);
  await openSpectator(page);
  await page.locator('details.spectator-settings summary').click();
  await page.locator('.time-control-select').selectOption('normal');
  await page.getByRole('button', { name: 'Empezar partida', exact: true }).click();

  await expect(page.getByRole('status', { name: 'Estado de la partida espectador' })).toHaveText('Jaque', { timeout: 8_000 });
  await expect(page.getByRole('button', { name: /Casilla e8, rey negro, rey en jaque/i })).toBeVisible();
  await expect(page.locator('.error-boundary-screen')).toHaveCount(0);
});

test('Espectador · mate CPU contra CPU termina limpio', async ({ page }) => {
  await mockApi(page, {
    analysisMoves: [
      { from: 'f2', to: 'f3' },
      { from: 'e7', to: 'e5' },
      { from: 'g2', to: 'g4' },
      { from: 'd8', to: 'h4' },
    ],
  });
  await login(page);
  await openSpectator(page);
  await page.locator('details.spectator-settings summary').click();
  await page.locator('.time-control-select').selectOption('fast');
  await page.getByRole('button', { name: 'Empezar partida', exact: true }).click();

  const endgame = page.locator('.endgame-banner');
  await expect(endgame.getByRole('heading', { name: 'Partida terminada', exact: true })).toBeVisible({ timeout: 7_000 });
  await expect(endgame.getByText('Jaque mate — ganaron las negras.', { exact: true })).toBeVisible();
  await expect(page.locator('.error-boundary-screen')).toHaveCount(0);
});

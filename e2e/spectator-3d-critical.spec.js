import { expect, test } from '@playwright/test';
import {
  clickBoard3DMove,
  login,
  mockApi,
  openBoard3D,
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

test('Tablero 3D · jaque humano sobrevive al turno diferido de CPU', async ({ page }) => {
  await mockApi(page, { analysisMoves: [{ from: 'f7', to: 'f6' }, { from: 'g7', to: 'g6' }] });
  await login(page);
  await openBoard3D(page);

  await clickBoard3DMove(page, 'e2', 'e4');
  await page.waitForTimeout(850);
  await clickBoard3DMove(page, 'd1', 'h5');
  await expect(page.getByRole('status', { name: 'Estado del tablero 3D' })).toHaveText('Jaque');
  await expect(page.locator('.error-boundary-screen')).toHaveCount(0);
});

test('Tablero 3D · mate de Scholar termina sin callback CPU zombi', async ({ page }) => {
  await mockApi(page, {
    analysisMoves: [
      { from: 'e7', to: 'e5' },
      { from: 'b8', to: 'c6' },
      { from: 'g8', to: 'f6' },
    ],
  });
  await login(page);
  await openBoard3D(page);

  for (const [from, to] of [['e2', 'e4'], ['f1', 'c4'], ['d1', 'h5']]) {
    await clickBoard3DMove(page, from, to);
    await page.waitForTimeout(850);
  }
  await clickBoard3DMove(page, 'h5', 'f7');

  await expect(page.locator('.endgame-banner').getByText('¡Jaque mate, ganaste!', { exact: true })).toBeVisible();
  await page.waitForTimeout(800);
  await expect(page.getByText('La CPU está pensando…', { exact: false })).toHaveCount(0);
  await expect(page.locator('.error-boundary-screen')).toHaveCount(0);
});

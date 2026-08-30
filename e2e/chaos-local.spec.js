import { expect, test } from '@playwright/test';
import { buttonWithVisibleText, gameTurn, login, mockApi } from './helpers.js';

// Deliberadamente fuera del E2E normal. Se ejecuta con CHESS_CHAOS=1 desde
// scripts/chaos_local.py para romper transporte de verdad sin convertir cada
// push en una prueba de destrucción controlada.
test('chaos local · corte de transporte durante restauración conserva la partida', async ({ page }) => {
  await mockApi(page);
  await login(page);

  await buttonWithVisibleText(page, 'Partida rápida').click();
  const dialog = page.getByRole('dialog', { name: 'Configurar partida rápida' });
  await dialog.getByRole('button', { name: 'Empezar partida', exact: true }).click();
  await expect(gameTurn(page)).toBeVisible();

  const gameApiPattern = 'http://localhost:4000/api/games/**';
  const disconnectGameReads = async (route) => {
    if (route.request().method() === 'GET') {
      await route.abort('internetdisconnected');
      return;
    }
    await route.fallback();
  };

  // La ruta se instala después de crear la partida: el frontend y el perfil
  // siguen disponibles, pero la autoridad de la partida desaparece durante
  // la restauración, como ocurriría con un corte entre navegador y backend.
  await page.route(gameApiPattern, disconnectGameReads);
  await page.reload();

  await expect(page.getByText('La partida sigue guardada.', { exact: true })).toBeVisible();
  const retry = page.getByRole('button', { name: 'Reintentar recuperación', exact: true });
  await expect(retry).toBeVisible();
  await expect(page.getByRole('region', { name: 'Hoy en Chess Studio' })).toHaveCount(0);
  await expect(page.locator('.error-boundary-screen')).toHaveCount(0);

  // Restablecemos el transporte y exigimos recuperación sobre la misma ruta,
  // sin recrear partida ni limpiar el snapshot local.
  await page.unroute(gameApiPattern, disconnectGameReads);
  await retry.click();
  await expect(gameTurn(page)).toBeVisible();
  await expect(page.getByText('La partida sigue guardada.', { exact: true })).toHaveCount(0);
  await expect(buttonWithVisibleText(page, 'Partida rápida')).toHaveCount(0);
});

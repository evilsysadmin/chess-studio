import { expect, test } from '@playwright/test';
import { login, mockApi } from './helpers.js';

test('Home · el avatar residente de Matthias abre Así juegas aunque haya partida guardada', async ({ page }) => {
  await mockApi(page, { profileSeed: {
    'matthias.onboarded': '2',
    'chess-study-home-guide-dismissed-v1': '1',
  } });
  await login(page);

  // Una partida prioritaria puede silenciar el bocadillo de Matthias, pero no
  // borrar al personaje de Home. Este estado reproduce perfiles que vuelven a
  // la aplicación con una sesión guardada pendiente de continuar.
  await page.evaluate(() => {
    localStorage.setItem('chess-study-active-game', 'saved-home-presence-e2e');
  });
  await page.reload();

  await expect(page.getByRole('button', { name: /Continuar partida/ })).toBeVisible();
  const corner = page.getByRole('complementary', { name: 'Rincón de Matthias' });
  await expect(corner).toBeVisible();
  await expect(corner.getByRole('region', { name: 'Mensaje de Matthias' })).toHaveCount(0);

  await corner.getByRole('button', { name: 'Abrir Así juegas con Matthias', exact: true }).click();
  await expect(page.getByRole('heading', { name: /Así juegas/i }).first()).toBeVisible();
});

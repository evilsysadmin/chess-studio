import { expect, test } from '@playwright/test';
import { login, mockApi } from './helpers.js';

test.use({ viewport: { width: 1672, height: 941 } });

test('Home · JUGAR "Más formas de jugar": 1 vs 1 y práctica viven en el menú, Escape lo cierra', async ({ page }) => {
  await mockApi(page);
  await login(page);
  const home = page.getByRole('region', { name: 'Modos principales' });
  const more = home.getByRole('button', { name: /Más formas de jugar/ });
  const menu = home.getByRole('group', { name: 'Más formas de jugar' });

  await expect(more).toBeVisible();
  await expect(more).toHaveAttribute('aria-expanded', 'false');
  await expect(menu).toHaveCount(0);
  // On desktop the floating 1 vs 1 card is gone: the entry is inside the menu.
  await expect(page.getByRole('button', { name: 'Abrir rivales 1 contra 1 de War Room' })).toHaveCount(0);

  await more.click();
  await expect(more).toHaveAttribute('aria-expanded', 'true');
  await expect(menu.getByRole('button', { name: 'Abrir rivales 1 contra 1 de War Room' })).toBeVisible();
  await expect(menu.getByRole('button', { name: /Partida de práctica/ })).toBeVisible();

  await page.keyboard.press('Escape');
  await expect(menu).toHaveCount(0);

  await more.click();
  await menu.getByRole('button', { name: /Partida de práctica/ }).click();
  await expect(menu).toHaveCount(0);
  await expect(page.getByRole('dialog', { name: 'Configurar partida de práctica' })).toBeVisible();
});

import { expect, test } from '@playwright/test';
import { buttonWithVisibleText, login, mockApi } from './helpers.js';

test('Partida rápida · 2D entra directo al tablero ligero', async ({ page }) => {
  await mockApi(page);
  await login(page);

  await buttonWithVisibleText(page, 'Partida rápida').click();
  const dialog = page.getByRole('dialog', { name: 'Configurar partida rápida' });
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: 'Jugar en 2D, directo al tablero', exact: true }).click();

  await expect(page.getByRole('group', { name: /Tablero de ajedrez/ })).toBeVisible();
  await expect(page.locator('[data-board3d-war-room="true"]')).toHaveCount(0);
});

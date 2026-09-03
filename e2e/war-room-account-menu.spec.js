import { expect, test } from '@playwright/test';
import { buttonWithVisibleText, gameTurn, login, mockApi } from './helpers.js';

async function setWarRoom3D(page) {
  const board3d = page.locator('[data-board3d-war-room="true"]');
  if (!(await board3d.isVisible().catch(() => false))) {
    await page.getByRole('button', { name: 'Cambiar apariencia y piezas del tablero', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Ajustes' });
    await expect(dialog).toBeVisible();
    await dialog.getByRole('radio', { name: /3D$/ }).click();
    await dialog.getByRole('button', { name: 'Cerrar', exact: true }).click();
  }
  await expect(board3d).toBeVisible({ timeout: 45_000 });
  await expect(page.locator('.board3d-main-canvas')).toBeVisible({ timeout: 45_000 });
}

test('War Room · Mi cuenta queda por encima del canvas y abre el diálogo', async ({ page }) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 1440, height: 960 });
  await mockApi(page);
  await login(page);
  await buttonWithVisibleText(page, 'Partida rápida').click();
  await page.getByRole('button', { name: 'Empezar partida', exact: true }).click();
  await expect(gameTurn(page)).toBeVisible();
  await setWarRoom3D(page);

  const account = page.getByRole('button', { name: 'Abrir menú de cuenta', exact: true });
  await expect(account).toBeVisible();
  await account.click();
  const accountItem = page.getByRole('menuitem', { name: /Mi cuenta/ });
  await expect(accountItem).toBeVisible();
  await accountItem.click();
  await expect(page.getByRole('dialog', { name: 'Mi cuenta' })).toBeVisible();
});

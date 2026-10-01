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

test('War Room · cuenta vive como gear junto al overflow de partida', async ({ page }) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 1440, height: 960 });
  await mockApi(page);
  await login(page);
  await buttonWithVisibleText(page, 'Partida rápida').click();
  await page.getByRole('button', { name: 'Empezar partida', exact: true }).click();
  await expect(gameTurn(page)).toBeVisible();
  await setWarRoom3D(page);

  const utility = page.getByRole('button', { name: 'Más acciones de partida', exact: true });
  const account = page.getByRole('button', { name: 'Mi cuenta', exact: true });
  const legacyAccount = page.locator('.masthead-account-trigger');
  await expect(utility).toBeVisible();
  await expect(account).toBeVisible();
  await expect(legacyAccount).toBeHidden();

  const [utilityBox, accountBox] = await Promise.all([utility.boundingBox(), account.boundingBox()]);
  expect(utilityBox).not.toBeNull();
  expect(accountBox).not.toBeNull();
  expect(accountBox.x).toBeGreaterThanOrEqual(utilityBox.x + utilityBox.width - 2);
  expect(accountBox.x - (utilityBox.x + utilityBox.width)).toBeLessThanOrEqual(14);
  expect(accountBox.width).toBeGreaterThanOrEqual(30);
  expect(accountBox.height).toBeGreaterThanOrEqual(30);

  await account.click();
  const accountItem = page.getByRole('menuitem', { name: /Mi cuenta/ });
  await expect(accountItem).toBeVisible();
  await accountItem.click();
  await expect(page.getByRole('dialog', { name: 'Mi cuenta' })).toBeVisible();
});

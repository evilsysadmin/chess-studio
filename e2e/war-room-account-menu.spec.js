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

test('War Room · desktop retira la barra pero conserva Cuenta y Feedback flotantes', async ({ page }) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 1440, height: 960 });
  await mockApi(page);
  await login(page);
  await buttonWithVisibleText(page, 'Partida rápida').click();
  await page.getByRole('button', { name: 'Empezar partida', exact: true }).click();
  await expect(gameTurn(page)).toBeVisible();
  await setWarRoom3D(page);

  const account = page.getByRole('button', { name: 'Abrir menú de cuenta', exact: true });
  const feedback = page.locator('.masthead-feedback-trigger');
  const releases = page.locator('.masthead-release-trigger');
  await expect(account).toBeVisible();
  await expect(feedback).toBeVisible();
  await expect(releases).toBeHidden();

  // The semantic masthead may stay mounted so its menus keep working, but in
  // desktop 3D it must cost effectively zero layout pixels. Only the two small
  // utility controls are allowed to float over the right rail.
  const chrome = await page.evaluate(() => {
    const mastheadNode = document.querySelector('.app-shell-board-game > .masthead-game-compact');
    const actionsNode = mastheadNode?.querySelector('.masthead-actions');
    const feedbackNode = mastheadNode?.querySelector('.masthead-feedback-trigger');
    const accountNode = mastheadNode?.querySelector('.masthead-account-trigger');
    const masthead = mastheadNode?.getBoundingClientRect();
    const actions = actionsNode?.getBoundingClientRect();
    const feedbackRect = feedbackNode?.getBoundingClientRect();
    const accountRect = accountNode?.getBoundingClientRect();
    if (!masthead || !actions || !feedbackRect || !accountRect) return null;
    return {
      mastheadWidth: masthead.width,
      mastheadHeight: masthead.height,
      actionsWidth: actions.width,
      actionsHeight: actions.height,
      feedbackWidth: feedbackRect.width,
      feedbackHeight: feedbackRect.height,
      accountWidth: accountRect.width,
      accountHeight: accountRect.height,
    };
  });

  expect(chrome).not.toBeNull();
  expect(chrome.mastheadWidth).toBeLessThanOrEqual(1);
  expect(chrome.mastheadHeight).toBeLessThanOrEqual(1);
  expect(chrome.actionsWidth).toBeGreaterThan(60);
  expect(chrome.actionsHeight).toBeLessThanOrEqual(34);
  expect(chrome.feedbackWidth).toBeGreaterThanOrEqual(30);
  expect(chrome.feedbackWidth).toBeLessThanOrEqual(34);
  expect(chrome.feedbackHeight).toBeLessThanOrEqual(34);
  expect(chrome.accountWidth).toBeGreaterThanOrEqual(30);
  expect(chrome.accountWidth).toBeLessThanOrEqual(34);
  expect(chrome.accountHeight).toBeLessThanOrEqual(34);

  await account.click();
  const accountItem = page.getByRole('menuitem', { name: /Mi cuenta/ });
  await expect(accountItem).toBeVisible();
  await accountItem.click();
  await expect(page.getByRole('dialog', { name: 'Mi cuenta' })).toBeVisible();
});

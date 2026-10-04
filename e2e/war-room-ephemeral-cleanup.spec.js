import { expect, test } from '@playwright/test';
import { buttonWithVisibleText, login, mockApi } from './helpers.js';
import { navigateWarRoomKeyboard } from './war-room-board-input.js';

const READY_TIMEOUT = 45_000;
const ACTIVE_GAME_SESSION_KEY = 'chess-study-active-game-session-v1';

async function expectWarRoom(page) {
  const board3d = page.locator('[data-board3d-war-room="true"]');
  const canvas = page.locator('.board3d-main-canvas');
  await expect(board3d).toBeVisible({ timeout: READY_TIMEOUT });
  await expect(canvas).toHaveCount(1, { timeout: READY_TIMEOUT });
  await expect(canvas).toBeVisible();
  return { board3d, canvas };
}

async function switchTo2D(page) {
  const utilityMenu = page.getByRole('button', { name: 'Más acciones de partida', exact: true });
  await expect(utilityMenu).toBeVisible({ timeout: READY_TIMEOUT });
  await utilityMenu.click();
  await page.getByRole('menuitem', { name: 'Apariencia', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Ajustes' });
  await expect(dialog).toBeVisible();
  await dialog.getByRole('radio', { name: /2D$/ }).click();
  await dialog.getByRole('button', { name: 'Cerrar', exact: true }).evaluate((element) => element.click());
  await expect(dialog).toBeHidden({ timeout: 15_000 });
  await expect(page.locator('.board-grid').first()).toBeVisible({ timeout: READY_TIMEOUT });
  await expect(page.locator('.board3d-main-canvas')).toHaveCount(0);
}

async function switchTo3D(page) {
  await page.getByRole('button', { name: 'Cambiar apariencia y piezas del tablero', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Ajustes' });
  await expect(dialog).toBeVisible();
  await dialog.getByRole('radio', { name: /3D$/ }).click();
  await dialog.getByRole('button', { name: 'Cerrar', exact: true }).evaluate((element) => element.click());
  await expect(dialog).toBeHidden({ timeout: 15_000 });
  return expectWarRoom(page);
}

test('War Room · el estado efímero 3D se limpia sin borrar selección compartida', async ({ page }) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1440, height: 960 });
  await mockApi(page);
  await login(page);

  await buttonWithVisibleText(page, 'Partida rápida').click();
  await page.getByRole('button', { name: 'Empezar partida', exact: true }).click();
  const { board3d, canvas } = await expectWarRoom(page);

  // La selección pertenece al estado común del tablero y debe sobrevivir al
  // cambio de renderer. El foco de teclado sí es privado de 3D.
  await navigateWarRoomKeyboard(canvas, board3d, 'e2');
  await canvas.press('Enter');
  await expect(board3d).toHaveAttribute('data-board3d-selected', 'e2');
  await expect(board3d).toHaveAttribute('data-board3d-legal-target-count', '2');
  await expect(canvas).toHaveAttribute('aria-label', /Usa flechas y Enter para jugar con teclado/);
  // La cámara táctica es fija: no hay modo inspección (retirado a petición de
  // producto); el zoom de dos dedos vive fuera del canvas.
  await expect(page.getByRole('button', { name: 'Inspeccionar', exact: true })).toHaveCount(0);

  await switchTo2D(page);
  const remounted = await switchTo3D(page);

  await expect(remounted.board3d).toHaveAttribute('data-board3d-selected', 'e2');
  await expect(remounted.board3d).toHaveAttribute('data-board3d-legal-target-count', '2');
  await expect(remounted.board3d).toHaveAttribute('data-board3d-focused', 'e1');
  await expect(page.locator('.board3d-main-canvas')).toHaveCount(1);
  await expect(page.locator('.error-boundary-screen')).toHaveCount(0);
});

test('War Room · abandonar desde 3D destruye renderer y snapshot activo antes de volver a Home', async ({ page }) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 1440, height: 960 });
  await mockApi(page);
  await login(page);

  await buttonWithVisibleText(page, 'Partida rápida').click();
  await page.getByRole('button', { name: 'Empezar partida', exact: true }).click();
  const { board3d, canvas } = await expectWarRoom(page);

  await expect.poll(() => page.evaluate((key) => localStorage.getItem(key) !== null, ACTIVE_GAME_SESSION_KEY), {
    timeout: 5_000,
  }).toBe(true);

  // Salimos con estado privado deliberadamente vivo para asegurar que abandonar
  // no deja selección/canvas huérfanos detrás de Home.
  await navigateWarRoomKeyboard(canvas, board3d, 'e2');
  await canvas.press('Enter');
  await expect(board3d).toHaveAttribute('data-board3d-selected', 'e2');

  await page.getByRole('button', { name: 'Salir de la partida', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: '¿Abandonar la partida?' });
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: /Cancelar sin penalización|Abandonar y asumir resultado/ }).click();

  await expect(page.locator('.illustrated-home')).toBeVisible({ timeout: 10_000 });
  await expect(dialog).toHaveCount(0);
  await expect(page.locator('[data-board3d-war-room="true"]')).toHaveCount(0);
  await expect(page.locator('.board3d-main-canvas')).toHaveCount(0);
  await expect(page.locator('.error-boundary-screen')).toHaveCount(0);
  await expect.poll(() => page.evaluate((key) => localStorage.getItem(key), ACTIVE_GAME_SESSION_KEY), {
    timeout: 5_000,
  }).toBeNull();
});

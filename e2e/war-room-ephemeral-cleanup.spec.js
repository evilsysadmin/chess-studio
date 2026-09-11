import { expect, test } from '@playwright/test';
import { buttonWithVisibleText, login, mockApi } from './helpers.js';
import { navigateWarRoomKeyboard } from './war-room-board-input.js';

const READY_TIMEOUT = 45_000;

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

test('War Room · inspección, foco y cámara efímeros se limpian al desmontar y remontar 3D', async ({ page }) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1440, height: 960 });
  await mockApi(page);
  await login(page);

  await buttonWithVisibleText(page, 'Partida rápida').click();
  await page.getByRole('button', { name: 'Empezar partida', exact: true }).click();
  const { board3d, canvas } = await expectWarRoom(page);

  // Dejamos estado deliberadamente no canónico dentro del renderer: foco lejos
  // de la casilla inicial, selección activa, modo inspección y cámara arrastrada.
  await navigateWarRoomKeyboard(canvas, board3d, 'e2');
  await canvas.press('Enter');
  await expect(board3d).toHaveAttribute('data-board3d-selected', 'e2');
  await expect(board3d).toHaveAttribute('data-board3d-legal-target-count', '2');

  const inspect = page.getByRole('button', { name: 'Inspeccionar', exact: true });
  await inspect.click();
  await expect(board3d).toHaveAttribute('data-board3d-inspect', 'true');
  await expect(page.getByRole('button', { name: 'Volver a jugar', exact: true })).toBeVisible();

  const box = await canvas.boundingBox();
  expect(box).not.toBeNull();
  await page.mouse.move(box.x + box.width * 0.52, box.y + box.height * 0.52);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.68, box.y + box.height * 0.42, { steps: 5 });
  await page.mouse.up();

  // Cambiar renderer debe destruir todo el estado privado anterior; sólo la
  // partida común puede sobrevivir al desmontaje.
  await switchTo2D(page);
  const remounted = await switchTo3D(page);

  await expect(remounted.board3d).toHaveAttribute('data-board3d-inspect', 'false');
  await expect(remounted.board3d).toHaveAttribute('data-board3d-selected', '');
  await expect(remounted.board3d).toHaveAttribute('data-board3d-legal-target-count', '0');
  await expect(remounted.board3d).toHaveAttribute('data-board3d-focused', 'e1');
  await expect(page.getByRole('button', { name: 'Inspeccionar', exact: true })).toHaveAttribute('aria-pressed', 'false');
  await expect(page.getByRole('button', { name: 'Volver a jugar', exact: true })).toHaveCount(0);
  await expect(page.locator('.board3d-main-canvas')).toHaveCount(1);
  await expect(page.locator('.error-boundary-screen')).toHaveCount(0);
});
import { expect, test } from '@playwright/test';
import { buttonWithVisibleText, gameStatus, login, mockApi } from './helpers.js';

const WAR_ROOM_READY_TIMEOUT = 45_000;

async function setRendererViaAppearance(page, renderer) {
  const warRoom = page.locator('[data-board3d-war-room="true"]');
  if (await warRoom.count()) {
    await page.getByRole('button', { name: 'Apariencia', exact: true }).click();
  } else {
    await page.getByRole('button', { name: 'Cambiar apariencia y piezas del tablero', exact: true }).click();
  }

  const dialog = page.getByRole('dialog', { name: 'Ajustes' });
  await expect(dialog).toBeVisible();
  await dialog.getByRole('radio', { name: new RegExp(`${renderer}$`) }).click();
  await dialog.getByRole('button', { name: 'Cerrar', exact: true }).click();
}

async function startScenario(page, scenario, requestLog) {
  await page.setViewportSize({ width: 1440, height: 960 });
  await mockApi(page, { gameScenario: scenario, requestLog });
  await login(page);
  await buttonWithVisibleText(page, 'Partida rápida').click();
  await page.getByRole('button', { name: 'Empezar partida', exact: true }).click();
  await expect(gameStatus(page)).toBeVisible();
}

async function waitForWarRoom(page) {
  const board3d = page.locator('[data-board3d-war-room="true"]');
  const canvas = page.locator('.board3d-main-canvas');
  await expect(board3d).toBeVisible({ timeout: WAR_ROOM_READY_TIMEOUT });
  await expect(canvas).toBeVisible({ timeout: WAR_ROOM_READY_TIMEOUT });
  return { board3d, canvas };
}

function movePosts(requestLog) {
  return requestLog.filter((entry) => entry.method === 'POST' && /\/games\/[^/]+\/move$/.test(entry.path));
}

test('War Room parity · jaque seleccionado en 2D se ejecuta en 3D y vuelve a 2D con el mismo rey marcado', async ({ page }) => {
  test.setTimeout(90_000);
  const requestLog = [];
  await startScenario(page, 'check', requestLog);

  const queen = page.getByRole('button', { name: /^Casilla e2, dama blanca/i });
  await queen.click();
  await expect(queen).toHaveClass(/selected/);

  await setRendererViaAppearance(page, '3D');
  const { board3d, canvas } = await waitForWarRoom(page);
  await expect(board3d).toHaveAttribute('data-board3d-selected', 'e2');
  await expect(board3d).toHaveAttribute('data-board3d-focused', 'e1');

  await canvas.focus();
  for (let step = 0; step < 7; step += 1) await canvas.press('ArrowUp');
  await expect(board3d).toHaveAttribute('data-board3d-focused', 'e8');
  await canvas.press('Enter');

  await expect.poll(() => movePosts(requestLog).length).toBe(1);
  await expect(gameStatus(page).getByText('Jaque', { exact: true })).toBeVisible();
  await expect(page.getByRole('dialog', { name: /partida finalizada/i })).toHaveCount(0);

  await setRendererViaAppearance(page, '2D');
  await expect(page.getByRole('button', { name: /Casilla h8, rey negro, rey en jaque/i })).toBeVisible();
  await expect(gameStatus(page).getByText('Jaque', { exact: true })).toBeVisible();
  await expect(movePosts(requestLog)).resolves;
});

test('War Room parity · selección 2D puede rematar jaque mate desde el teclado 3D una sola vez', async ({ page }) => {
  test.setTimeout(90_000);
  const requestLog = [];
  await startScenario(page, 'mate', requestLog);

  const queen = page.getByRole('button', { name: /^Casilla g6, dama blanca/i });
  await queen.click();
  await expect(queen).toHaveClass(/selected/);

  await setRendererViaAppearance(page, '3D');
  const { board3d, canvas } = await waitForWarRoom(page);
  await expect(board3d).toHaveAttribute('data-board3d-selected', 'g6');

  await canvas.focus();
  await canvas.press('ArrowRight');
  await canvas.press('ArrowRight');
  for (let step = 0; step < 6; step += 1) await canvas.press('ArrowUp');
  await expect(board3d).toHaveAttribute('data-board3d-focused', 'g7');
  await canvas.press('Enter');

  await expect.poll(() => movePosts(requestLog).length).toBe(1);
  const endgame = page.getByRole('dialog').filter({ has: page.getByRole('heading', { name: 'Jaque mate', exact: true }) });
  await expect(endgame).toBeVisible();
  await expect(endgame.getByText('¡Ganaste la partida!', { exact: true })).toBeVisible();
  await expect(page.locator('.error-boundary-screen')).toHaveCount(0);
});

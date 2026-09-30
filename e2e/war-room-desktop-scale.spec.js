import { expect, test } from '@playwright/test';
import { activateSetupControl, buttonWithVisibleText, login, mockApi } from './helpers.js';

async function openDesktopWarRoom(page) {
  await page.setViewportSize({ width: 1440, height: 960 });
  await mockApi(page);
  await login(page);

  await buttonWithVisibleText(page, 'Partida rápida').click();
  await activateSetupControl(page.getByRole('button', { name: 'Empezar partida', exact: true }));

  const warRoom = page.locator('.board-live-row.is-3d-warroom');
  const shell = page.locator('.board3d-main-shell');
  await expect(warRoom).toBeVisible({ timeout: 45_000 });
  await expect(shell).toBeVisible({ timeout: 45_000 });

  return { warRoom, shell };
}

test('War Room · desktop usa inmersión única con tablero protagonista y HUD flotante', async ({ page }) => {
  test.setTimeout(90_000);
  const { warRoom, shell } = await openDesktopWarRoom(page);

  const layout = page.locator('.game-layout-3d');
  const turnPill = page.locator('.game-3d-command-column .game-3d-turn-pill');
  const utility = page.getByRole('button', { name: 'Más acciones de partida', exact: true });

  await expect(layout).toHaveClass(/game-layout-immersive/);
  await expect(layout).toHaveAttribute('data-war-room-immersive', 'true');
  await expect(page.locator('body')).toHaveClass(/war-room-immersive-active/);
  await expect(turnPill).toBeVisible();
  await expect(turnPill).toContainText('Matthias');
  await expect(utility).toBeVisible();

  await expect(page.locator('.game-side-column.game-side-column-3d')).toBeHidden();
  await expect(page.locator('.game-board-stack-3d > .game-player-rail.is-human')).toBeHidden();
  await expect(page.locator('.game-board-stack-3d > .game-command-deck')).toBeHidden();

  await page.waitForTimeout(1200);

  const geometry = await page.evaluate(() => {
    const layoutNode = document.querySelector('.game-layout-3d');
    const roomNode = document.querySelector('.board-live-row.is-3d-warroom');
    const boardNode = document.querySelector('.board3d-main-shell');
    const pillNode = document.querySelector('.game-3d-turn-pill');
    if (!layoutNode || !roomNode || !boardNode || !pillNode) return null;
    const layoutRect = layoutNode.getBoundingClientRect();
    const roomRect = roomNode.getBoundingClientRect();
    const boardRect = boardNode.getBoundingClientRect();
    const pillRect = pillNode.getBoundingClientRect();
    return {
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight,
      documentWidth: document.documentElement.scrollWidth,
      documentHeight: document.documentElement.scrollHeight,
      layout: { left: layoutRect.left, top: layoutRect.top, right: layoutRect.right, bottom: layoutRect.bottom },
      room: { left: roomRect.left, top: roomRect.top, right: roomRect.right, bottom: roomRect.bottom },
      board: { left: boardRect.left, top: boardRect.top, right: boardRect.right, bottom: boardRect.bottom, width: boardRect.width, height: boardRect.height },
      pill: { left: pillRect.left, top: pillRect.top, right: pillRect.right, bottom: pillRect.bottom },
    };
  });

  expect(geometry).not.toBeNull();
  expect(Math.abs(geometry.layout.left)).toBeLessThanOrEqual(1);
  expect(Math.abs(geometry.layout.top)).toBeLessThanOrEqual(1);
  expect(Math.abs(geometry.layout.right - geometry.viewportWidth)).toBeLessThanOrEqual(1);
  expect(Math.abs(geometry.layout.bottom - geometry.viewportHeight)).toBeLessThanOrEqual(1);

  expect(geometry.board.width).toBeGreaterThan(1000);
  expect(geometry.board.height).toBeGreaterThan(700);
  expect(geometry.board.left).toBeLessThanOrEqual(2);
  expect(geometry.board.top).toBeLessThanOrEqual(2);
  expect(geometry.board.right).toBeGreaterThanOrEqual(geometry.viewportWidth - 2);
  expect(geometry.board.bottom).toBeGreaterThanOrEqual(geometry.viewportHeight - 10);

  expect(geometry.pill.top).toBeGreaterThanOrEqual(0);
  expect(geometry.pill.bottom).toBeLessThanOrEqual(geometry.viewportHeight);
  expect(geometry.pill.left).toBeGreaterThanOrEqual(0);
  expect(geometry.pill.right).toBeLessThanOrEqual(geometry.viewportWidth);

  expect(geometry.documentWidth).toBeLessThanOrEqual(geometry.viewportWidth + 1);
  expect(geometry.documentHeight).toBeLessThanOrEqual(geometry.viewportHeight + 1);

  await expect(warRoom).toBeVisible();
  await expect(shell).toBeVisible();
});

// Con «reducir movimiento» del sistema, una regla global anula todas las
// animaciones, así que el aviso «Guardado» no puede depender de desvanecerse
// para apartarse: nunca debe tapar el HUD (turno, Guía, ⋯) ni la cuenta.
for (const viewport of [{ width: 1024, height: 768 }, { width: 1440, height: 900 }]) {
  test(`War Room · desktop · Guardado no tapa el HUD con movimiento reducido · ${viewport.width}×${viewport.height}`, async ({ page }) => {
    test.setTimeout(120_000);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.setViewportSize(viewport);
    await mockApi(page);
    await login(page);
    await buttonWithVisibleText(page, 'Partida rápida').click();
    await activateSetupControl(page.getByRole('button', { name: 'Empezar partida', exact: true }));
    await expect(page.locator('.board-live-row.is-3d-warroom')).toBeVisible({ timeout: 90_000 });

    const saved = page.locator('.save-status-badge');
    await expect(saved).toContainText('Guardado');
    await page.waitForTimeout(2_000);
    // A 1440×900 la escena 3D con GL por software satura el renderer en CI y un
    // boundingBox puede tardar más de 12 s aunque el nodo ya esté en el árbol.
    const MEASURE = { timeout: 45_000 };
    const badge = await saved.boundingBox(MEASURE);
    expect(badge, 'Guardado sigue en el árbol').not.toBeNull();
    for (const [label, locator] of [
      ['turno', page.locator('.game-3d-command-column .game-3d-turn-pill')],
      ['guía', page.getByRole('button', { name: /Abrir guía de la War Room/ })],
      ['más acciones', page.getByRole('button', { name: 'Más acciones de partida', exact: true })],
      ['cuenta', page.locator('.masthead-account-trigger')],
    ]) {
      if (label !== 'cuenta') await expect(locator, label).toBeVisible();
      const box = (await locator.count()) ? await locator.boundingBox(MEASURE) : null;
      // Entre 821 y 1080 px la cuenta se pliega fuera del HUD flotante.
      if (!box || box.width < 1 || box.height < 1) continue;
      const overlapX = Math.min(badge.x + badge.width, box.x + box.width) - Math.max(badge.x, box.x);
      const overlapY = Math.min(badge.y + badge.height, box.y + box.height) - Math.max(badge.y, box.y);
      expect(overlapX > 0.5 && overlapY > 0.5, `Guardado no debe tapar ${label}: ${JSON.stringify({ badge, box })}`).toBe(false);
    }
    expect(badge.y + badge.height, 'Guardado dentro del viewport').toBeLessThanOrEqual(viewport.height);
    expect(badge.x, 'Guardado dentro del viewport').toBeGreaterThanOrEqual(0);
    expect(badge.x + badge.width, 'Guardado dentro del viewport').toBeLessThanOrEqual(viewport.width);
  });
}

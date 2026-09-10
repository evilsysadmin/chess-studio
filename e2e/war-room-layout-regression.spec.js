import { expect, test } from '@playwright/test';
import { buttonWithVisibleText, login, mockApi } from './helpers.js';

const WAR_ROOM_READY_TIMEOUT = 45_000;

async function openQuickGameWarRoom(page) {
  await page.setViewportSize({ width: 1440, height: 900 });
  await mockApi(page);
  await login(page);
  await buttonWithVisibleText(page, 'Partida rápida').click();
  await page.getByRole('button', { name: 'Empezar partida', exact: true }).click();
  return waitForWarRoom(page);
}

async function waitForWarRoom(page) {
  const row = page.locator('.board-live-row.is-3d-warroom');
  const shell = page.locator('.board3d-main-shell');
  const canvas = page.locator('.board3d-main-canvas');
  await expect(row).toBeVisible({ timeout: WAR_ROOM_READY_TIMEOUT });
  await expect(shell).toBeVisible({ timeout: WAR_ROOM_READY_TIMEOUT });
  await expect(canvas).toBeVisible({ timeout: WAR_ROOM_READY_TIMEOUT });
  return { row, shell, canvas };
}

async function box(locator) {
  const value = await locator.boundingBox();
  expect(value).not.toBeNull();
  return value;
}

async function expectNoHorizontalOverflow(page) {
  const geometry = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    viewportWidth: window.innerWidth,
  }));
  expect(geometry.scrollWidth).toBeLessThanOrEqual(geometry.viewportWidth + 1);
}

async function expectDesktopChromeContract(page, shell) {
  const status = page.locator('.game-3d-command-column');
  const inspect = page.getByRole('button', { name: 'Inspeccionar', exact: true });
  const zen = page.getByRole('button', { name: 'Zen', exact: true });
  const abandon = page.getByRole('button', { name: 'Abandonar', exact: true });
  const more = page.getByRole('button', { name: 'Más acciones de partida', exact: true });

  await expect(status).toBeVisible();
  await expect(inspect).toBeVisible();
  await expect(zen).toBeVisible();
  await expect(abandon).toBeVisible();
  await expect(more).toBeVisible();

  const shellBox = await box(shell);
  const statusBox = await box(status);
  const inspectBox = await box(inspect);
  const zenBox = await box(zen);
  const abandonBox = await box(abandon);

  // Match controls live in the right rail, never on top of the board scene.
  expect(statusBox.x).toBeGreaterThanOrEqual(shellBox.x + shellBox.width - 2);
  expect(zenBox.x).toBeGreaterThanOrEqual(shellBox.x + shellBox.width - 2);
  expect(abandonBox.x).toBeGreaterThanOrEqual(shellBox.x + shellBox.width - 2);

  // Inspect is a compact scene chip on the quiet upper wall, not a board-eating CTA.
  expect(inspectBox.width).toBeLessThan(Math.min(160, shellBox.width * 0.2));
  expect(inspectBox.height).toBeLessThan(48);
  expect(inspectBox.x - shellBox.x).toBeGreaterThanOrEqual(0);
  expect(inspectBox.x - shellBox.x).toBeLessThan(26);
  expect(inspectBox.y - shellBox.y).toBeGreaterThanOrEqual(0);
  expect(inspectBox.y - shellBox.y).toBeLessThan(26);
  expect(inspectBox.y + inspectBox.height).toBeLessThan(shellBox.y + shellBox.height * 0.18);

  return { shellBox, statusBox, inspectBox };
}

function expectGeometryStable(before, after, tolerance = 6) {
  for (const key of ['x', 'y', 'width', 'height']) {
    expect(Math.abs(before[key] - after[key])).toBeLessThanOrEqual(tolerance);
  }
}

test('War Room · chrome crítico no invade el tablero y sobrevive post-paint, 1366×768, móvil y F5', async ({ page }) => {
  test.setTimeout(150_000);

  const { shell } = await openQuickGameWarRoom(page);
  await expectNoHorizontalOverflow(page);
  const initial = await expectDesktopChromeContract(page, shell);

  // Several regressions only appeared after deferred Three/CSS/image work settled.
  // Keep this deliberately coarse: we care that chrome remains present and placed,
  // not about pixel-perfect rendering or animation timing.
  await page.waitForTimeout(1_500);
  const settled = await expectDesktopChromeContract(page, shell);
  expectGeometryStable(initial.shellBox, settled.shellBox);
  expectGeometryStable(initial.statusBox, settled.statusBox);
  expectGeometryStable(initial.inspectBox, settled.inspectBox);

  await page.setViewportSize({ width: 1366, height: 768 });
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  await expectNoHorizontalOverflow(page);
  const shortDesktop = await expectDesktopChromeContract(page, shell);
  expect(shortDesktop.shellBox.y + shortDesktop.shellBox.height).toBeLessThanOrEqual(768 + 1);
  expect(shortDesktop.statusBox.y + shortDesktop.statusBox.height).toBeLessThanOrEqual(768 + 1);

  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  await expectNoHorizontalOverflow(page);
  const mobileShell = await box(shell);
  expect(mobileShell.x).toBeGreaterThanOrEqual(-1);
  expect(mobileShell.x + mobileShell.width).toBeLessThanOrEqual(391);

  // F5 must restore the same active War Room instead of falling back to Home/2D
  // or losing the compact Matthias/turn status after the deferred renderer remount.
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.reload();
  const restored = await waitForWarRoom(page);
  await expect(restored.row).toBeVisible();
  await expect(restored.shell).toHaveAttribute('data-board3d-scene', 'premium');
  await expectDesktopChromeContract(page, restored.shell);
  await expectNoHorizontalOverflow(page);
});

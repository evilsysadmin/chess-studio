import { expect, test } from '@playwright/test';
import {
  login,
  loginAndOpenDeployment,
  mockApi,
  openMoreGameModes,
} from './helpers.js';

const READY = 45_000;

function normalized(vector) {
  const length = Math.hypot(...vector);
  return vector.map((value) => value / length);
}

function cross(a, b) {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
}

function dot(a, b) {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

// Deployment hover still needs one pointer coordinate. The gameplay assertions
// below use Board3D's keyboard contract instead of guessing pixels.
function projectSquare(rect, square, worldY = 0.12) {
  const aspect = Math.max(0.35, rect.width / Math.max(1, rect.height));
  const profile = aspect >= 1.42
    ? { halfSpan: 5.38, padding: 1.07, minDistance: 13.2, maxDistance: 22.6, targetY: 1.08, targetZ: -0.16, cameraY: 7.35, cameraZ: 10.6 }
    : { halfSpan: 5.78, padding: 1.13, minDistance: 14.5, maxDistance: 25.6, targetY: 0.92, targetZ: -0.08, cameraY: 8.2, cameraZ: 10.72 };
  const verticalFov = 40 * Math.PI / 180;
  const horizontalFov = 2 * Math.atan(Math.tan(verticalFov / 2) * aspect);
  const limitingFov = Math.min(verticalFov, horizontalFov);
  const distance = Math.max(
    profile.minDistance,
    Math.min(profile.maxDistance, (profile.halfSpan / Math.tan(limitingFov / 2)) * profile.padding),
  );
  const target = [0, profile.targetY, -profile.targetZ];
  const direction = normalized([0, profile.cameraY, profile.cameraZ]);
  const camera = target.map((value, index) => value + direction[index] * distance);
  const fileIndex = square.charCodeAt(0) - 97;
  const rank = Number(square[1]);
  const point = [fileIndex - 3.5, worldY, 4.5 - rank];
  const forward = normalized(target.map((value, index) => value - camera[index]));
  const right = normalized(cross(forward, [0, 1, 0]));
  const up = cross(right, forward);
  const relative = point.map((value, index) => value - camera[index]);
  const depth = dot(relative, forward);
  const ndcX = dot(relative, right) / (depth * Math.tan(verticalFov / 2) * aspect);
  const ndcY = dot(relative, up) / (depth * Math.tan(verticalFov / 2));
  return {
    x: rect.x + ((ndcX + 1) / 2) * rect.width,
    y: rect.y + ((1 - ndcY) / 2) * rect.height,
  };
}

test('Arena experimental · tema, terreno y legalidad sobreviven al renderer 3D', async ({ page }) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 1440, height: 960 });
  await mockApi(page, { profileSeed: { 'chess-study-board-renderer': '3d' } });
  await login(page);

  const moreModes = await openMoreGameModes(page);
  const experiments = moreModes
    .locator('.friendly-disclosure-body > .menu-card-shell > button')
    .filter({ hasText: 'Experimentos geniales' });
  await expect(experiments).toHaveCount(1);
  await expect(experiments).toBeVisible();
  await experiments.click();
  await expect(page.getByRole('heading', { name: 'Experimentos geniales', exact: true })).toBeVisible();
  await page.getByRole('button', { name: /Arenas experimentales/i }).click();

  const arena = page.getByRole('region', { name: 'Arena experimental con terreno bloqueado' });
  await expect(arena).toBeVisible();
  const board = arena.locator('[data-board3d-war-room="true"]');
  const canvas = arena.locator('.board3d-main-canvas');
  await expect(board).toBeVisible({ timeout: READY });
  await expect(canvas).toBeVisible({ timeout: READY });
  await expect(board).toHaveAttribute('data-board3d-theme', 'obsidian');
  await expect(board).toHaveAttribute('data-board3d-terrain-count', '4');
  await expect(board).toHaveAttribute('data-board3d-turn', 'human');

  // Board3D starts focused on e1 for White. Use its real keyboard contract so
  // Arena parity is independent of camera projection and cosmetic geometry.
  await canvas.focus();
  await page.keyboard.press('ArrowLeft');
  await page.keyboard.press('ArrowLeft');
  await page.keyboard.press('ArrowUp');
  await page.keyboard.press('ArrowUp');
  await page.keyboard.press('ArrowUp');
  await expect(board).toHaveAttribute('data-board3d-focused', 'c4');
  await page.keyboard.press('Enter');
  await expect(board).toHaveAttribute('data-board3d-selected', '');

  // c4 is blocked. Move down to the real pawn on c2; terrain-aware rules must
  // select it and expose only the legal destination that survives La Brecha.
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowDown');
  await expect(board).toHaveAttribute('data-board3d-focused', 'c2');
  await page.keyboard.press('Enter');
  await expect(board).toHaveAttribute('data-board3d-selected', 'c2');
  await expect(board).toHaveAttribute('data-board3d-legal-target-count', '1');
});

test('Combat Deployment · hover de unidad y metadata táctica funcionan sobre el canvas 3D', async ({ page }) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 1440, height: 960 });
  const deployment = await loginAndOpenDeployment(page);

  const board = deployment.locator('[data-board3d-war-room="true"]');
  const canvas = deployment.locator('.board3d-main-canvas');
  await expect(board).toBeVisible({ timeout: READY });
  await expect(canvas).toBeVisible({ timeout: READY });
  await expect(board).toHaveAttribute('data-board3d-legal-target-count', /[1-9][0-9]*/);
  await expect(deployment.locator('.board3d-parity-details')).toHaveCount(1);

  const rect = await canvas.boundingBox();
  expect(rect).toBeTruthy();

  // Hit the tile centre, not the visual top of the model. The 3D input layer
  // resolves the square first and then checks whether that square owns a piece,
  // making hover stable across pawn skins and veteran geometry.
  const pawn = projectSquare(rect, 'a2');
  await page.mouse.move(pawn.x, pawn.y);

  // Deployment delays hover previews deliberately. The renderer now provides
  // the same stable DOM anchor contract as Board2D instead of leaking a native
  // PointerEvent whose currentTarget lifetime is browser-dependent.
  const dossier = page.getByRole('dialog', { name: /Ficha de unidad de/i });
  await expect(dossier).toBeVisible({ timeout: 4_000 });
  await expect(dossier).toHaveClass(/\bpreview\b/);
  await expect(dossier.getByText(/Vista rápida/i)).toBeVisible();

  // Move to a coordinate guaranteed to be outside both the canvas and the
  // dossier. Hovering another DOM element can cross the fixed popover and make
  // the test accidentally exercise its keep-open affordance instead of the
  // canvas leave contract we actually care about.
  await page.mouse.move(1, 1);
  await expect(dossier).toBeHidden({ timeout: 3_000 });
});

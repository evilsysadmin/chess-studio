import { expect, test } from '@playwright/test';
import {
  login,
  mockApi,
  openCampaignBriefing,
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

function pointInside(rect, point) {
  if (!rect) return false;
  return point.x >= rect.x
    && point.x <= rect.x + rect.width
    && point.y >= rect.y
    && point.y <= rect.y + rect.height;
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

async function openHeavy3DSurface(button, readySurface) {
  // Hosted software-WebGL can make the React commit behind these transitions
  // expensive enough that Playwright's user-action click waits on the mount and
  // hits the action timeout. We already assert that the real button is visible
  // and enabled; dispatch its DOM click and synchronize on the resulting 3D UI.
  await expect(button).toBeVisible();
  await expect(button).toBeEnabled();
  await button.evaluate((element) => element.click());
  await expect(readySurface).toBeVisible({ timeout: READY });
}

async function openDeploymentForSpecialSurface(page) {
  const deployment = page.getByRole('region', { name: 'Preparar despliegue de Combat Chess' });
  if (await deployment.isVisible().catch(() => false)) return deployment;

  const enterPreparation = page.getByRole('button', { name: /PREPARAR EJÉRCITO/i });
  if (await enterPreparation.isVisible().catch(() => false)) {
    await openHeavy3DSurface(enterPreparation, page.getByLabel('Resumen de preparación').or(deployment));
    if (await deployment.isVisible().catch(() => false)) return deployment;
  }

  const reviewDeployment = page.getByRole('button', { name: /PREPARAR DESPLIEGUE|REVISAR Y CONFIRMAR|Personalizar despliegue/i });
  await openHeavy3DSurface(reviewDeployment, deployment);
  return deployment;
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

  const arena = page.getByRole('region', { name: 'Arena experimental con terreno bloqueado' });
  await openHeavy3DSurface(page.getByRole('button', { name: /Arenas experimentales/i }), arena);

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
  await mockApi(page);
  await login(page);
  await openCampaignBriefing(page);
  const deployment = await openDeploymentForSpecialSurface(page);

  const board = deployment.locator('[data-board3d-war-room="true"]');
  const boardSurface = deployment.locator('.preferred-board-3d');
  const canvas = deployment.locator('.board3d-main-canvas');
  await expect(board).toBeVisible({ timeout: READY });
  await expect(boardSurface).toBeVisible({ timeout: READY });
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

  // Deployment delays hover previews deliberately. Hosted software-WebGL can
  // leave the main thread busy for several seconds even though the preview is
  // already queued; failure screenshots prove the dossier eventually appears.
  // Keep this strict enough to catch a broken hover without racing the runner.
  const dossier = page.getByRole('dialog', { name: /Ficha de unidad de/i });
  await expect(dossier).toBeVisible({ timeout: 8_000 });
  await expect(dossier).toHaveClass(/\bpreview\b/);
  await expect(dossier.getByText(/Vista rápida/i)).toBeVisible();

  // The dossier is intentionally a hover bridge: moving from the WebGL piece
  // into the fixed portal keeps the preview alive so the user can inspect it.
  // Exercise that real interaction first, then leave both surfaces. A one-step
  // pointer teleport from WebGL straight to a distant corner can skip the
  // portal's mouseenter/mouseleave pair and is not representative user input.
  const surfaceRect = await boardSurface.boundingBox();
  const dossierRect = await dossier.boundingBox();
  expect(dossierRect).toBeTruthy();
  await page.mouse.move(
    dossierRect.x + dossierRect.width / 2,
    dossierRect.y + Math.min(24, dossierRect.height / 2),
  );
  await expect(dossier).toBeVisible();

  const viewport = page.viewportSize();
  const corners = [
    { x: 2, y: 2 },
    { x: viewport.width - 2, y: 2 },
    { x: 2, y: viewport.height - 2 },
    { x: viewport.width - 2, y: viewport.height - 2 },
  ];
  const exitPoint = corners.find((point) => !pointInside(surfaceRect, point) && !pointInside(dossierRect, point));
  expect(exitPoint).toBeTruthy();
  await page.mouse.move(exitPoint.x, exitPoint.y);
  await expect(dossier).toBeHidden({ timeout: 3_000 });
});

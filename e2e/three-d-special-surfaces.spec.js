import { expect, test } from '@playwright/test';
import {
  login,
  mockApi,
  openCampaignBriefing,
  openDeployment,
  openMoreGameModes,
  scheduleDomClick,
} from './helpers.js';

const READY = 45_000;

async function openHeavy3DSurface(button, readySurface) {
  // Hosted software-WebGL can make the React commit behind these transitions
  // expensive enough that Playwright's user-action click waits on the mount and
  // hits the action timeout. We already assert that the real button is visible
  // and enabled; dispatch its DOM click and synchronize on the resulting 3D UI.
  await expect(button).toBeVisible();
  await expect(button).toBeEnabled();
  await scheduleDomClick(button);
  await expect(readySurface).toBeVisible({ timeout: READY });
}

test('Arena experimental · tema, terreno y legalidad sobreviven al renderer 3D', async ({ page }) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 1440, height: 960 });
  await mockApi(page, { profileSeed: { 'chess-study-board-renderer': '3d' } });
  await login(page);

  const moreModes = await openMoreGameModes(page);
  const experiments = moreModes
    .getByRole('button')
    .filter({ hasText: 'Experimentos geniales' });
  await expect(experiments).toHaveCount(1);
  const experimentsHeading = page.getByRole('heading', { name: 'Experimentos geniales', exact: true });
  await openHeavy3DSurface(experiments, experimentsHeading);

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

test('Combat Deployment · War Table 2D conserva hover y ficha táctica', async ({ page }) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 1440, height: 960 });
  await mockApi(page);
  await login(page);
  await openCampaignBriefing(page);
  const deployment = await openDeployment(page);

  await expect(deployment).toBeVisible({ timeout: READY });
  const pawnSquare = deployment.getByRole('button', { name: /Casilla a2,/ });
  const pawn = pawnSquare.locator('img.piece.piece-event-target');
  await expect(pawn).toBeVisible({ timeout: READY });

  await pawn.hover();
  const dossier = page.getByRole('dialog', { name: /Ficha de unidad de/i });
  await expect(dossier).toBeVisible({ timeout: 8_000 });
  await expect(dossier).toHaveClass(/\bpreview\b/);
  await expect(dossier.getByText(/Vista rápida/i)).toBeVisible();
});

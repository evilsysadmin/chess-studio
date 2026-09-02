import { devices, expect, test } from '@playwright/test';
import { buttonWithVisibleText, gameTurn, login, mockApi } from './helpers.js';

test.use({ ...devices['Pixel 5'] });

async function open3DFromAppearance(page) {
  await page.getByRole('button', { name: 'Cambiar apariencia y piezas del tablero', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Ajustes' });
  await expect(dialog).toBeVisible();
  await dialog.getByRole('radio', { name: /3D$/ }).click();
  await dialog.getByRole('button', { name: 'Cerrar', exact: true }).click();
}

test('War Room · Android mantiene a Matthias vivo con Three.js y fallback corporal', async ({ page }) => {
  test.setTimeout(75_000);
  await page.addInitScript(() => {
    // The regression is about compact rendering, not an OS accessibility
    // preference. Force motion allowed so a CI runner cannot hide the bug.
    localStorage.setItem('chess-study-reduced-motion', '0');
  });

  await mockApi(page);
  await login(page);
  await buttonWithVisibleText(page, 'Partida rápida').click();
  await page.getByRole('button', { name: 'Empezar partida', exact: true }).click();
  await expect(gameTurn(page)).toBeVisible();
  await open3DFromAppearance(page);

  const board3d = page.locator('[data-board3d-war-room="true"]');
  const wrap = page.locator('.game-3d-matthias-portrait-wrap');
  const portrait = wrap.locator('.game-3d-matthias-portrait');
  const three = wrap.locator('[data-matthias-three-avatar="true"]');

  await expect(board3d).toBeVisible({ timeout: 30_000 });
  await expect(wrap).toBeVisible({ timeout: 30_000 });
  await expect(wrap).toHaveAttribute('data-matthias-motion-version', 'v4-android');
  await expect(wrap).toHaveAttribute('data-matthias-compact-motion', 'true');
  await expect(three).toHaveAttribute('data-three-motion', 'active');
  await expect(three).toHaveAttribute('data-three-motion-intensity', '1.35');

  // Primary path: the optional portrait Three.js context must actually paint
  // and keep advancing alongside the main War Room renderer on a Pixel profile.
  await expect(three).toHaveAttribute('data-three-ready', 'true', { timeout: 30_000 });
  await expect(three).toHaveAttribute('data-three-failed', 'false');
  const firstFrame = Number(await three.getAttribute('data-three-frame'));
  await expect.poll(async () => Number(await three.getAttribute('data-three-frame')), { timeout: 12_000 })
    .toBeGreaterThan(firstFrame + 5);

  // Fallback path: compact Matthias must still visibly breathe as one canonical
  // portrait even if a real Android GPU later refuses the optional WebGL context.
  await expect.poll(async () => portrait.evaluate((node) => getComputedStyle(node).animationName))
    .toContain('matthias-warroom-mobile-portrait-breathe');
  const transformA = await portrait.evaluate((node) => getComputedStyle(node).transform);
  await page.waitForTimeout(650);
  const transformB = await portrait.evaluate((node) => getComputedStyle(node).transform);
  expect(transformA).not.toBe('none');
  expect(transformB).not.toBe(transformA);
});

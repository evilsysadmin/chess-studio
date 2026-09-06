import { expect, test } from '@playwright/test';
import { login, mockApi } from './helpers.js';

async function dismissGuide(page) {
  const guide = page.getByRole('region', { name: 'Guía rápida de Chess Studio' });
  if (await guide.isVisible().catch(() => false)) {
    await guide.getByRole('button', { name: 'Ahora no', exact: true }).click();
  }
}

async function openExperimentsHub(page) {
  await mockApi(page);
  await login(page);
  await dismissGuide(page);
  const moreModes = page.locator('details.home-more-modes');
  if (!(await moreModes.evaluate((node) => node.open))) {
    await moreModes.getByText('Más modos de juego', { exact: true }).click();
  }
  await moreModes
    .locator('.friendly-disclosure-body > .menu-card-shell > button')
    .filter({ hasText: 'Experimentos geniales' })
    .click();
  await expect(page.getByRole('heading', { name: 'Experimentos geniales', exact: true })).toBeVisible();
}

async function openChesscom(page) {
  await openExperimentsHub(page);
  await page.getByRole('button', { name: /Chesscom/ }).click();
  await expect(page.getByRole('heading', { name: 'CHESSCOM', exact: true })).toBeVisible();
}

test('Chesscom · abre la planta 17 con renderer Babylon real y HUD Dust Veil premium', async ({ page }) => {
  test.setTimeout(75_000);
  await openChesscom(page);

  const mode = page.locator('[data-chesscom-poc="true"][data-chesscom-renderer="babylon"]');
  await expect(mode).toBeVisible();
  await expect(mode).toHaveAttribute('data-chesscom-visual', 'premium-v1');
  await expect(mode.getByText('OPERATION: DUST VEIL', { exact: true })).toBeVisible();
  await expect(mode.getByText('Kharif Outpost', { exact: true })).toBeVisible();
  await expect(mode.getByText('HK416 (Used)', { exact: true })).toBeVisible();
  await expect(mode.locator('.chesscom-economy strong')).toHaveText(/^(?:3400|3[.\u00a0\u202f ]400) cr$/);

  const canvas = mode.locator('.chesscom-babylon-host canvas');
  await expect(canvas).toBeVisible({ timeout: 30_000 });
  await expect(mode.getByText(/BABYLON\.JS 9\.25\.0 · GPU PREMIUM V2 · BALLISTICS/)).toBeVisible({ timeout: 30_000 });
  await expect(mode.getByText('BABYLON · ERROR', { exact: true })).toHaveCount(0);

  const dieterArt = mode.locator('.chesscom-portrait-art.is-dieter');
  await expect(dieterArt).toBeVisible();
  await expect.poll(() => dieterArt.evaluate((node) => getComputedStyle(node).backgroundImage)).toContain('/chesscom/ops-atlas.webp');
  await expect(mode.locator('.chesscom-weapon-art')).toBeVisible();

  await expect(mode.getByRole('button', { name: 'Move', exact: true })).toBeVisible();
  await expect(mode.getByRole('button', { name: 'Shoot', exact: true })).toBeVisible();
  await expect(mode.getByRole('button', { name: 'Overwatch', exact: true })).toBeVisible();
  await expect(mode.getByRole('button', { name: 'End turn', exact: true })).toBeVisible();

  const fireModes = mode.getByRole('group', { name: 'Modo de disparo' });
  await expect(fireModes.getByRole('button', { name: 'SA', exact: true })).toBeVisible();
  await expect(fireModes.getByRole('button', { name: 'Ráfaga', exact: true })).toBeVisible();
  await expect(fireModes.getByRole('button', { name: 'Auto', exact: true })).toBeVisible();
  await fireModes.getByRole('button', { name: 'Ráfaga', exact: true }).click();
  await expect(fireModes.getByRole('button', { name: 'Ráfaga', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(mode.locator('.chesscom-mission-badge strong')).toHaveText('SHOOT');

  await mode.locator('.chesscom-squad-card').filter({ hasText: 'Sven' }).click();
  await expect(mode.getByRole('group', { name: 'Modo de disparo' }).getByRole('button', { name: 'Ráfaga', exact: true })).toHaveCount(0);
  await expect(mode.getByRole('group', { name: 'Modo de disparo' }).getByRole('button', { name: 'Auto', exact: true })).toBeVisible();

  // Reutilizamos el Babylon ya arrancado para comprobar también la salida. El
  // contrato es el mismo que el antiguo tercer test, sin otro login + boot 3D.
  await page.getByRole('button', { name: '← Experimentos', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Experimentos geniales', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: /Chesscom/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /Pawn Slug/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /Pawn Trailblazer/ })).toBeVisible();
});

test('Chesscom · no hereda el scroll del Hangar al entrar', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 640 });
  await openExperimentsHub(page);

  const card = page.getByRole('button', { name: /Chesscom/ });
  await card.scrollIntoViewIfNeeded();
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  const inheritedScroll = await page.evaluate(() => window.scrollY);
  expect(inheritedScroll).toBeGreaterThan(0);

  // DOM click deliberately preserves the old document scroll so the mode itself
  // owns the transition instead of Playwright helpfully scrolling the card.
  await card.evaluate((node) => node.click());
  await expect(page.getByRole('heading', { name: 'CHESSCOM', exact: true })).toBeVisible();
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
  const brandTop = await page.getByRole('heading', { name: 'CHESSCOM', exact: true }).evaluate((node) => node.getBoundingClientRect().top);
  expect(brandTop).toBeGreaterThanOrEqual(0);
});

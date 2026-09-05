import { expect, test } from '@playwright/test';
import { login, mockApi } from './helpers.js';

async function dismissGuide(page) {
  const guide = page.getByRole('region', { name: 'Guía rápida de Chess Studio' });
  if (await guide.isVisible().catch(() => false)) {
    await guide.getByRole('button', { name: 'Ahora no', exact: true }).click();
  }
}

async function openPawnTrailblazer(page) {
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
  await page.getByRole('button', { name: /Pawn Trailblazer/ }).click();
  await expect(page.getByRole('heading', { name: 'Pawn Trailblazer', exact: true })).toBeVisible();
}

test('Pawn Trailblazer · arranca con Three.js real y entra en carrera', async ({ page }) => {
  await openPawnTrailblazer(page);

  const mode = page.locator('[data-pawn-trailblazer="true"]');
  const stage = mode.locator('[data-pawn-trailblazer-renderer="three"]');
  await expect(mode).toBeVisible();
  await expect(stage).toBeVisible();
  await expect(stage.locator('canvas')).toBeVisible({ timeout: 30_000 });
  await expect(mode.getByText(/Motor THREE\.JS · WebGL[12]/)).toBeVisible({ timeout: 30_000 });
  await expect(mode.getByText('No se ha podido iniciar el motor 3D.')).toHaveCount(0);

  await mode.getByRole('button', { name: 'Iniciar carrera', exact: true }).click();
  await expect(mode).not.toHaveAttribute('data-trail-phase', 'ready');
  await expect(mode.getByLabel('Controles táctiles')).toBeHidden();

  // Conservamos la salida en el mismo recorrido para no pagar otro boot Three.
  await page.getByRole('button', { name: '← Experimentos', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Experimentos geniales', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: /Pawn Trailblazer/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /Pawn Slug/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /Chesscom/ })).toBeVisible();
});

test('Pawn Trailblazer · móvil conserva controles utilizables sin overflow horizontal', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openPawnTrailblazer(page);
  const mode = page.locator('[data-pawn-trailblazer="true"]');
  await mode.getByRole('button', { name: 'Iniciar carrera', exact: true }).click();

  const controls = mode.getByLabel('Controles táctiles');
  await expect(controls).toBeVisible();
  for (const name of ['Mover o capturar a la izquierda', 'Acción', 'Mover o capturar a la derecha']) {
    const button = mode.getByRole('button', { name, exact: true });
    await expect(button).toBeVisible();
    const box = await button.boundingBox();
    expect(box).not.toBeNull();
    expect(box.height).toBeGreaterThanOrEqual(50);
  }

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
});

import { expect, test } from '@playwright/test';
import { login, mockApi, openMoreGameModes } from './helpers.js';

test.use({ reducedMotion: 'reduce' });

async function dismissGuide(page) {
  const guide = page.getByRole('region', { name: 'Guía rápida de Chess Studio' });
  if (!(await guide.isVisible().catch(() => false))) return;

  const dismiss = guide.getByRole('button', { name: 'Ahora no', exact: true });
  if (await dismiss.isVisible().catch(() => false)) {
    await dismiss.click();
    return;
  }

  const close = guide.getByRole('button', { name: 'Cerrar guía rápida', exact: true });
  if (await close.isVisible().catch(() => false)) await close.click();
}

async function openPawnTrailblazer(page) {
  await mockApi(page);
  await login(page);
  await dismissGuide(page);
  const moreModes = await openMoreGameModes(page);
  const experiments = moreModes.getByRole('button').filter({ hasText: 'Experimentos geniales' });
  await expect(experiments).toBeEnabled();
  await experiments.evaluate((element) => element.click());
  await expect(page.getByRole('heading', { name: 'Experimentos geniales', exact: true })).toBeVisible();
  const trailblazer = page.getByRole('button', { name: /Pawn Trailblazer/ });
  await expect(trailblazer).toBeEnabled();
  await trailblazer.evaluate((element) => element.click());
  await expect(page.getByRole('heading', { name: 'Pawn Trailblazer', exact: true })).toBeVisible({ timeout: 30_000 });
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
  await expect(page.locator('.lab-workshop-portal--trailblazer strong')).toHaveText('Pawn Trailblazer');
  await expect(page.locator('.lab-workshop-portal--pawnslug-godot strong')).toHaveText('PAWN SLUG GODOT');
  await expect(page.locator('.lab-workshop-map-table strong')).toHaveText('Chesscom');
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

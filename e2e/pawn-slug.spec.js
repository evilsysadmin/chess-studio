import { expect, test } from '@playwright/test';
import { login, mockApi, openMoreGameModes } from './helpers.js';

async function dismissHomeOverlays(page) {
  const guide = page.getByRole('region', { name: 'Guía rápida de Chess Studio' });
  if (await guide.isVisible().catch(() => false)) {
    const dismiss = guide.getByRole('button', { name: 'Ahora no', exact: true });
    const close = guide.getByRole('button', { name: 'Cerrar guía rápida', exact: true });
    if (await dismiss.isVisible().catch(() => false)) await dismiss.click();
    else if (await close.isVisible().catch(() => false)) await close.click();
  }

  const speech = page.getByRole('region', { name: 'Mensaje de Matthias', exact: true });
  if (await speech.isVisible().catch(() => false)) {
    const close = speech.getByRole('button', { name: 'Cerrar comentario de Matthias', exact: true });
    if (await close.isVisible().catch(() => false)) await close.click({ force: true });
  }
}

async function authenticate(page) {
  await mockApi(page);
  await login(page);
  await dismissHomeOverlays(page);
}

async function openExperiments(page) {
  const moreModes = await openMoreGameModes(page);
  const experiments = moreModes
    .getByRole('button')
    .filter({ hasText: 'Experimentos geniales' });
  await expect(experiments).toBeVisible();
  await experiments.click();
  await expect(page.getByRole('heading', { name: 'Experimentos geniales', exact: true })).toBeVisible();
}

async function expectGodotHost(page) {
  await expect(page.getByRole('heading', { name: 'PAWN SLUG GODOT', exact: true })).toBeVisible();
  await expect(page.locator('iframe[title="Pawn Slug Godot"]')).toBeVisible();
  await expect(page.locator('[data-pawn-slug-renderer="three"]')).toHaveCount(0);
}

test('Pawn Slug · el hub expone únicamente la puerta Godot y permite volver', async ({ page }) => {
  await authenticate(page);
  await openExperiments(page);

  const godotPortal = page.getByRole('button', { name: /PAWN SLUG GODOT/i });
  await expect(godotPortal).toBeVisible();
  await godotPortal.click();
  await expectGodotHost(page);

  await page.getByRole('button', { name: '← Experimentos', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Experimentos geniales', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: /PAWN SLUG GODOT/i })).toBeVisible();
  await expect(page.getByRole('button', { name: /^Pawn Slug$/ })).toHaveCount(0);
});

test('Pawn Slug · el host Godot móvil no introduce overflow horizontal', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await authenticate(page);
  await openExperiments(page);
  await page.getByRole('button', { name: /PAWN SLUG GODOT/i }).click();
  await expectGodotHost(page);

  const frame = page.locator('iframe[title="Pawn Slug Godot"]');
  const box = await frame.boundingBox();
  expect(box).not.toBeNull();
  expect(box.x).toBeGreaterThanOrEqual(-1);
  expect(box.x + box.width).toBeLessThanOrEqual(391);

  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(1);
});

import { expect, test } from '@playwright/test';
import { login, mockApi } from './helpers.js';

async function dismissHomeGuide(page) {
  const guide = page.getByRole('region', { name: 'Guía rápida de Chess Studio' });
  if (await guide.isVisible().catch(() => false)) {
    await guide.getByRole('button', { name: 'Ahora no', exact: true }).click();
  }
}

async function dismissMatthiasSpeech(corner) {
  const dismiss = corner.getByRole('button', { name: 'Cerrar comentario de Matthias', exact: true });
  if (await dismiss.isVisible().catch(() => false)) await dismiss.click();
}

async function openHome(page, { dismissSpeech = true } = {}) {
  await mockApi(page);
  await login(page);
  await dismissHomeGuide(page);
  const corner = page.getByRole('complementary', { name: 'Rincón de Matthias' });
  await expect(corner).toBeVisible();
  if (dismissSpeech) await dismissMatthiasSpeech(corner);
  return corner;
}

async function center(locator) {
  return locator.evaluate((node) => {
    const rect = node.getBoundingClientRect();
    return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
  });
}

async function expectCanonicalPortrait(matthias, label) {
  const frame = matthias.locator('[data-portrait-frame="true"]');
  const portrait = frame.locator('img[data-matthias-canonical-art="true"]');

  await expect(frame).toBeVisible();
  await expect(portrait).toBeVisible();
  await expect(frame.locator('[data-matthias-puppet="true"]')).toHaveCount(0);
  await expect(portrait).toHaveAttribute('src', /\.webp(?:$|\?)/);
  await expect.poll(
    () => portrait.evaluate((img) => img.complete && img.naturalWidth > 0 && img.naturalHeight > 0),
    { message: `${label}: el arte original de Matthias debe decodificarse realmente` },
  ).toBe(true);

  const frameContract = await frame.evaluate((node) => ({
    transform: getComputedStyle(node).transform,
    ownAnimations: node.getAnimations().length,
  }));
  expect(frameContract.transform, `${label}: el marco no puede transformarse`).toBe('none');
  expect(frameContract.ownAnimations, `${label}: el marco no puede animarse`).toBe(0);
  return { frame, portrait };
}

test('Home · Matthias usa los artes canónicos antiguos y no el SVG puppet', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  const corner = await openHome(page);

  const matthias = corner.getByRole('button', { name: 'Abrir Así juegas con Matthias', exact: true });
  const { frame } = await expectCanonicalPortrait(matthias, 'desktop');
  await expect(corner).toHaveAttribute('data-placement', 'viewport');
  await expect(corner).toHaveAttribute('data-motion-state', 'active');

  const before = await center(frame);
  await page.waitForTimeout(900);
  const after = await center(frame);
  expect(Math.abs(after.x - before.x), 'el marco debe permanecer clavado en X').toBeLessThan(1);
  expect(Math.abs(after.y - before.y), 'el marco debe permanecer clavado en Y').toBeLessThan(1);

  await matthias.click();
  await expect(page.getByRole('heading', { name: 'Así juegas', exact: true })).toBeVisible();
});

test('Home · el arte canónico de Matthias también cabe en móvil sin tapar contenido', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  const corner = await openHome(page);
  await expect(corner).toHaveAttribute('data-placement', 'inline');

  const matthias = corner.getByRole('button', { name: 'Abrir Así juegas con Matthias', exact: true });
  const { frame } = await expectCanonicalPortrait(matthias, 'móvil');
  const before = await center(frame);
  await page.waitForTimeout(900);
  const after = await center(frame);
  expect(Math.abs(after.x - before.x)).toBeLessThan(1);
  expect(Math.abs(after.y - before.y)).toBeLessThan(1);
});

test('Home · reduced-motion conserva el arte original y permite activar el movimiento explícitamente', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const corner = await openHome(page);
  await expect(corner).toHaveAttribute('data-motion-state', 'reduced');
  await expect(corner).toHaveAttribute('data-motion-source', 'system');

  const matthias = corner.getByRole('button', { name: 'Abrir Así juegas con Matthias', exact: true });
  await expectCanonicalPortrait(matthias, 'reduced-motion');

  const enable = corner.getByRole('button', { name: 'Movimiento desactivado por el sistema · activar', exact: true });
  await expect(enable).toBeVisible();
  await enable.click();
  await expect(corner).toHaveAttribute('data-motion-state', 'active');
  await expect(corner).toHaveAttribute('data-motion-source', 'app');
  await expect.poll(() => page.evaluate(() => document.documentElement.dataset.motionPreference)).toBe('allow');
});

test('Home · una preferencia guardada de reducir movimiento sigue siendo reversible con el arte original', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.addInitScript(() => localStorage.setItem('chess-study-reduced-motion', '1'));
  const corner = await openHome(page);
  await expect(corner).toHaveAttribute('data-motion-state', 'reduced');
  await expect(corner).toHaveAttribute('data-motion-source', 'app');

  const matthias = corner.getByRole('button', { name: 'Abrir Así juegas con Matthias', exact: true });
  await expectCanonicalPortrait(matthias, 'preferencia guardada');

  const enable = corner.getByRole('button', { name: 'Movimiento desactivado en Chess Studio · activar', exact: true });
  await enable.click();
  await expect(corner).toHaveAttribute('data-motion-state', 'active');
});

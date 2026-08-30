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

async function expectLayeredCanonicalPortrait(matthias, label) {
  const frame = matthias.locator('[data-portrait-frame="true"]');
  const rig = frame.locator('[data-matthias-layered-art="true"]');
  const portrait = rig.locator('img[data-matthias-canonical-art="true"]');

  await expect(frame).toBeVisible();
  await expect(rig).toBeVisible();
  await expect(portrait).toBeVisible();
  await expect(frame.locator('[data-matthias-puppet="true"]')).toHaveCount(0);
  await expect(frame.locator('svg')).toHaveCount(0);
  await expect(portrait).toHaveAttribute('src', /\.webp(?:$|\?)/);
  await expect.poll(
    () => portrait.evaluate((img) => img.complete && img.naturalWidth > 0 && img.naturalHeight > 0),
    { message: `${label}: el arte original de Matthias debe decodificarse realmente` },
  ).toBe(true);

  for (const part of ['head', 'eyes', 'left-arm', 'right-arm', 'prop']) {
    await expect(rig.locator(`[data-matthias-art-part="${part}"]`)).toHaveCount(1);
  }

  const frameContract = await frame.evaluate((node) => ({
    transform: getComputedStyle(node).transform,
    ownAnimations: node.getAnimations().length,
  }));
  expect(frameContract.transform, `${label}: el marco no puede transformarse`).toBe('none');
  expect(frameContract.ownAnimations, `${label}: el marco no puede animarse`).toBe(0);

  const baseContract = await portrait.evaluate((node) => ({
    transform: getComputedStyle(node).transform,
    ownAnimations: node.getAnimations().length,
  }));
  expect(baseContract.transform, `${label}: el bitmap canónico debe quedar fijo`).toBe('none');
  expect(baseContract.ownAnimations, `${label}: el bitmap canónico no puede animarse directamente`).toBe(0);

  return { frame, rig, portrait };
}

test('Home · Matthias conserva el arte antiguo pero mueve ojos, cabeza y extremidades por capas', async ({ page }) => {
  await page.addInitScript(() => { Math.random = () => 0; });
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  const corner = await openHome(page);

  const matthias = corner.getByRole('button', { name: 'Abrir Así juegas con Matthias', exact: true });
  const { frame, rig } = await expectLayeredCanonicalPortrait(matthias, 'desktop');
  await expect(corner).toHaveAttribute('data-placement', 'viewport');
  await expect(corner).toHaveAttribute('data-motion-state', 'active');
  await expect(rig).toHaveAttribute('data-gesture-state', 'waiting');

  const before = await center(frame);
  await expect.poll(
    () => rig.getAttribute('data-gesture-state'),
    { timeout: 5_000, message: 'Matthias debe iniciar un microgesto tras una pausa' },
  ).toBe('acting');

  const movingParts = await rig.evaluate((node) => Object.fromEntries(
    [...node.querySelectorAll('[data-matthias-art-part]')].map((part) => [
      part.dataset.matthiasArtPart,
      part.getAnimations().length,
    ]),
  ));
  expect(movingParts.head, 'la cabeza debe poder moverse independientemente').toBeGreaterThan(0);
  expect(movingParts.eyes, 'la mirada debe poder moverse independientemente').toBeGreaterThan(0);
  expect(
    (movingParts['left-arm'] || 0) + (movingParts['right-arm'] || 0) + (movingParts.prop || 0),
    'al menos un brazo/objeto debe acompañar el gesto contextual',
  ).toBeGreaterThan(0);

  const iterations = await rig.evaluate((node) => node.getAnimations({ subtree: true })
    .map((animation) => animation.effect?.getTiming?.().iterations));
  expect(iterations.length).toBeGreaterThan(0);
  expect(iterations.every((value) => value === 1), 'las capas deben usar gestos one-shot, no loops nerviosos').toBe(true);

  const during = await center(frame);
  expect(Math.abs(during.x - before.x), 'el marco debe permanecer clavado en X').toBeLessThan(1);
  expect(Math.abs(during.y - before.y), 'el marco debe permanecer clavado en Y').toBeLessThan(1);

  await expect.poll(
    () => rig.getAttribute('data-gesture-state'),
    { timeout: 3_000, message: 'tras el gesto las articulaciones deben volver a reposo' },
  ).toBe('rest');

  await matthias.click();
  await expect(page.getByRole('heading', { name: 'Así juegas', exact: true })).toBeVisible();
});

test('Home · el rig por capas también cabe en móvil sin mover la tarjeta', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  const corner = await openHome(page);
  await expect(corner).toHaveAttribute('data-placement', 'inline');

  const matthias = corner.getByRole('button', { name: 'Abrir Así juegas con Matthias', exact: true });
  const { frame, rig } = await expectLayeredCanonicalPortrait(matthias, 'móvil');
  const before = await center(frame);
  await page.waitForTimeout(900);
  const after = await center(frame);
  expect(Math.abs(after.x - before.x)).toBeLessThan(1);
  expect(Math.abs(after.y - before.y)).toBeLessThan(1);
  await expect(rig).toHaveAttribute('data-gesture-state', 'waiting');
});

test('Home · reduced-motion congela las capas y permite activarlas explícitamente', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const corner = await openHome(page);
  await expect(corner).toHaveAttribute('data-motion-state', 'reduced');
  await expect(corner).toHaveAttribute('data-motion-source', 'system');

  const matthias = corner.getByRole('button', { name: 'Abrir Así juegas con Matthias', exact: true });
  const { rig } = await expectLayeredCanonicalPortrait(matthias, 'reduced-motion');
  await expect(rig).toHaveAttribute('data-gesture-state', 'reduced');
  expect(await rig.evaluate((node) => node.getAnimations({ subtree: true }).length)).toBe(0);

  const enable = corner.getByRole('button', { name: 'Movimiento desactivado por el sistema · activar', exact: true });
  await expect(enable).toBeVisible();
  await enable.click();
  await expect(corner).toHaveAttribute('data-motion-state', 'active');
  await expect(corner).toHaveAttribute('data-motion-source', 'app');
  await expect.poll(() => page.evaluate(() => document.documentElement.dataset.motionPreference)).toBe('allow');
  await expect(rig).toHaveAttribute('data-gesture-state', 'waiting');
});

test('Home · una preferencia guardada de reducir movimiento sigue siendo reversible con el rig antiguo', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.addInitScript(() => localStorage.setItem('chess-study-reduced-motion', '1'));
  const corner = await openHome(page);
  await expect(corner).toHaveAttribute('data-motion-state', 'reduced');
  await expect(corner).toHaveAttribute('data-motion-source', 'app');

  const matthias = corner.getByRole('button', { name: 'Abrir Así juegas con Matthias', exact: true });
  const { rig } = await expectLayeredCanonicalPortrait(matthias, 'preferencia guardada');
  await expect(rig).toHaveAttribute('data-gesture-state', 'reduced');

  const enable = corner.getByRole('button', { name: 'Movimiento desactivado en Chess Studio · activar', exact: true });
  await enable.click();
  await expect(corner).toHaveAttribute('data-motion-state', 'active');
  await expect(rig).toHaveAttribute('data-gesture-state', 'waiting');
});

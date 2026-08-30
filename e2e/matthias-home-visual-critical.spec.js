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

async function expectRigStructure(matthias, label) {
  const frame = matthias.locator('[data-portrait-frame="true"]');
  const puppet = matthias.locator('[data-matthias-puppet="true"]');

  await expect(frame).toBeVisible();
  await expect(puppet).toBeVisible();
  await expect(frame.locator('img')).toHaveCount(0);
  await expect(puppet).toHaveAttribute('data-puppet-form', 'military-pawn');
  await expect(puppet.locator('.matthias-puppet__pawn-silhouette')).toHaveCount(1);
  await expect(puppet.locator('[data-puppet-part="uniform"]')).toHaveCount(1);
  await expect(puppet.locator('[data-puppet-part="cap"]')).toHaveCount(1);
  await expect(puppet.locator('[data-puppet-part="body"]')).toHaveCount(1);
  await expect(puppet.locator('[data-puppet-part="head"]')).toHaveCount(1);
  await expect(puppet.locator('[data-puppet-part="eyes"]')).toHaveCount(1);
  await expect(puppet.locator('[data-puppet-part="lids"]')).toHaveCount(1);
  await expect(puppet.locator('[data-puppet-part="brows"]')).toHaveCount(1);
  await expect(puppet.locator('[data-puppet-part="mouth"]')).toHaveCount(1);
  await expect(puppet.locator('[data-puppet-part="moustache"]')).toHaveCount(1);
  await expect(puppet.locator('[data-puppet-part="left-arm"]')).toHaveCount(1);
  await expect(puppet.locator('[data-puppet-part="action-arm"]')).toHaveCount(1);
  await expect(puppet.locator('[data-puppet-part="prop"]')).toHaveCount(1);

  const frameContract = await frame.evaluate((node) => ({
    transform: getComputedStyle(node).transform,
    ownAnimations: node.getAnimations().length,
  }));
  expect(frameContract.transform, `${label}: el marco no puede transformarse`).toBe('none');
  expect(frameContract.ownAnimations, `${label}: el marco no puede animarse`).toBe(0);
  return { frame, puppet };
}

test('Home · Matthias conserva forma de peón militar y usa articulaciones one-shot', async ({ page }) => {
  await page.addInitScript(() => { Math.random = () => 0; });
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  const corner = await openHome(page);

  const matthias = corner.getByRole('button', { name: 'Abrir Así juegas con Matthias', exact: true });
  const { frame, puppet } = await expectRigStructure(matthias, 'desktop');
  await expect(corner).toHaveAttribute('data-placement', 'viewport');
  await expect(corner).toHaveAttribute('data-motion-state', 'active');
  await expect(puppet).toHaveAttribute('data-gesture-state', 'waiting');

  const frameBefore = await center(frame);
  await page.waitForTimeout(1200);
  await expect(puppet).toHaveAttribute('data-gesture-state', 'waiting');
  expect(await puppet.evaluate((node) => node.getAnimations({ subtree: true }).length)).toBe(0);

  await expect.poll(
    () => puppet.getAttribute('data-gesture-state'),
    { timeout: 10_500, message: 'Matthias debe hacer un gesto después de una pausa, no rebotar continuamente' },
  ).toBe('acting');

  const movingParts = await puppet.evaluate((node) => {
    const parts = [...node.querySelectorAll('[data-puppet-part]')];
    return Object.fromEntries(parts.map((part) => [part.dataset.puppetPart, part.getAnimations().length]));
  });
  expect(movingParts.body, 'el cuerpo/base de peón debe permanecer fijo').toBe(0);
  expect(movingParts.uniform, 'el uniforme pertenece al cuerpo fijo, no debe bailar').toBe(0);
  expect(
    Object.entries(movingParts).some(([part, count]) => !['body', 'uniform', 'cap'].includes(part) && count > 0),
    'al menos una articulación expresiva debe moverse durante el gesto',
  ).toBe(true);

  const timings = await puppet.evaluate((node) => node.getAnimations({ subtree: true }).map((animation) => animation.effect?.getTiming?.().iterations));
  expect(timings.length).toBeGreaterThan(0);
  expect(timings.every((iterations) => iterations === 1), 'ninguna articulación puede entrar en loop infinito').toBe(true);

  const frameDuring = await center(frame);
  expect(Math.abs(frameDuring.x - frameBefore.x), 'el marco debe permanecer clavado en X').toBeLessThan(1);
  expect(Math.abs(frameDuring.y - frameBefore.y), 'el marco debe permanecer clavado en Y').toBeLessThan(1);

  await expect.poll(
    () => puppet.getAttribute('data-gesture-state'),
    { timeout: 3_000, message: 'después del gesto Matthias debe volver a reposo' },
  ).toBe('rest');
  await expect.poll(() => puppet.evaluate((node) => node.getAnimations({ subtree: true }).length)).toBe(0);

  await matthias.click();
  await expect(page.getByRole('heading', { name: 'Así juegas', exact: true })).toBeVisible();
});

test('Home · el peón militar articulado también cabe en móvil sin mover su tarjeta', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  const corner = await openHome(page);
  await expect(corner).toHaveAttribute('data-placement', 'inline');

  const matthias = corner.getByRole('button', { name: 'Abrir Así juegas con Matthias', exact: true });
  const { frame, puppet } = await expectRigStructure(matthias, 'móvil');
  const before = await center(frame);
  await page.waitForTimeout(900);
  const after = await center(frame);
  expect(Math.abs(after.x - before.x)).toBeLessThan(1);
  expect(Math.abs(after.y - before.y)).toBeLessThan(1);
  await expect(puppet).toHaveAttribute('data-gesture-state', 'waiting');
});

test('Home · reduced-motion congela las articulaciones y permite activarlas explícitamente', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const corner = await openHome(page);
  await expect(corner).toHaveAttribute('data-motion-state', 'reduced');
  await expect(corner).toHaveAttribute('data-motion-source', 'system');

  const puppet = corner.locator('[data-matthias-puppet="true"]');
  await expect(puppet).toBeVisible();
  await expect(puppet).toHaveAttribute('data-puppet-form', 'military-pawn');
  expect(await puppet.evaluate((node) => node.getAnimations({ subtree: true }).length)).toBe(0);

  const enable = corner.getByRole('button', { name: 'Movimiento desactivado por el sistema · activar', exact: true });
  await expect(enable).toBeVisible();
  await enable.click();
  await expect(corner).toHaveAttribute('data-motion-state', 'active');
  await expect(corner).toHaveAttribute('data-motion-source', 'app');
  await expect.poll(() => page.evaluate(() => document.documentElement.dataset.motionPreference)).toBe('allow');
});

test('Home · una preferencia guardada de reducir movimiento sigue siendo reversible con el puppet', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.addInitScript(() => localStorage.setItem('chess-study-reduced-motion', '1'));
  const corner = await openHome(page);
  await expect(corner).toHaveAttribute('data-motion-state', 'reduced');
  await expect(corner).toHaveAttribute('data-motion-source', 'app');

  const puppet = corner.locator('[data-matthias-puppet="true"]');
  await expect(puppet).toHaveAttribute('data-puppet-form', 'military-pawn');
  expect(await puppet.evaluate((node) => node.getAnimations({ subtree: true }).length)).toBe(0);

  const enable = corner.getByRole('button', { name: 'Movimiento desactivado en Chess Studio · activar', exact: true });
  await enable.click();
  await expect(corner).toHaveAttribute('data-motion-state', 'active');
});

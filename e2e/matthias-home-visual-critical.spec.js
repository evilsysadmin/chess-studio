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

async function setMatthiasHour(page, hour) {
  await page.addInitScript((fixedHour) => {
    Math.random = () => 0;
    Date.prototype.getHours = () => fixedHour;
  }, hour);
  await page.emulateMedia({ reducedMotion: 'no-preference' });
}

async function center(locator) {
  return locator.evaluate((node) => {
    const rect = node.getBoundingClientRect();
    return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
  });
}

async function box(locator) {
  return locator.evaluate((node) => {
    const rect = node.getBoundingClientRect();
    return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
  });
}

function distance(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

async function gestureCount(rig) {
  return Number(await rig.getAttribute('data-gesture-count')) || 0;
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
    const layer = rig.locator(`img[data-matthias-art-part="${part}"]`);
    await expect(layer).toHaveCount(1);
    await expect.poll(
      () => layer.evaluate((img) => img.complete && img.naturalWidth > 0 && img.naturalHeight > 0),
      { message: `${label}: la capa ${part} debe contener píxeles reales` },
    ).toBe(true);
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

test('Home · Tomando notas mueve mirada y mano de forma perceptible sin menear la cabeza', async ({ page }) => {
  await setMatthiasHour(page, 16);
  const corner = await openHome(page);

  const matthias = corner.getByRole('button', { name: 'Abrir Así juegas con Matthias', exact: true });
  const { frame, rig } = await expectLayeredCanonicalPortrait(matthias, 'tomando notas');
  await expect(corner).toHaveAttribute('data-placement', 'viewport');
  await expect(corner).toHaveAttribute('data-motion-state', 'active');
  await expect(rig).toHaveAttribute('data-rig-family', 'ops');
  await expect(rig).toHaveAttribute('data-gesture', 'write-notes');
  await expect(rig).toHaveAttribute('data-gesture-profile', 'deliberate');

  const head = rig.locator('[data-matthias-art-part="head"]');
  const eyes = rig.locator('[data-matthias-art-part="eyes"]');
  const arm = rig.locator('[data-matthias-art-part="right-arm"]');
  const frameBefore = await center(frame);
  const eyesBefore = await center(eyes);
  const armBefore = await center(arm);

  await expect.poll(
    () => gestureCount(rig),
    { timeout: 2_000, message: 'Matthias debe iniciar un gesto visible casi al entrar en Home' },
  ).toBeGreaterThan(0);
  await expect(rig).toHaveAttribute('data-gesture-state', 'acting');

  const movingParts = await rig.evaluate((node) => Object.fromEntries(
    [...node.querySelectorAll('[data-matthias-art-part]')].map((part) => [
      part.dataset.matthiasArtPart,
      part.getAnimations().length,
    ]),
  ));
  expect(movingParts.head || 0, 'tomar notas no debe animar la cabeza').toBe(0);
  expect(movingParts.eyes).toBeGreaterThan(0);
  expect(movingParts['right-arm']).toBeGreaterThan(0);
  expect(movingParts.prop || 0, 'el soporte debe quedarse quieto mientras escribe').toBe(0);

  await page.waitForTimeout(1200);
  expect(distance(armBefore, await center(arm)), 'el brazo que escribe debe verse claramente').toBeGreaterThan(2.5);
  expect(distance(eyesBefore, await center(eyes)), 'la mirada debe desplazarse de forma perceptible').toBeGreaterThan(1.5);

  const frameDuring = await center(frame);
  expect(Math.abs(frameDuring.x - frameBefore.x), 'el marco debe permanecer clavado en X').toBeLessThan(1);
  expect(Math.abs(frameDuring.y - frameBefore.y), 'el marco debe permanecer clavado en Y').toBeLessThan(1);

  await expect.poll(
    () => rig.getAttribute('data-gesture-state'),
    { timeout: 5_000, message: 'tras el gesto las articulaciones deben volver a reposo' },
  ).toBe('rest');
});

test('Home · Auditoría táctica mueve mirada, mano y expediente, no el cráneo', async ({ page }) => {
  await setMatthiasHour(page, 17);
  const corner = await openHome(page);
  const matthias = corner.getByRole('button', { name: 'Abrir Así juegas con Matthias', exact: true });
  const { rig } = await expectLayeredCanonicalPortrait(matthias, 'auditoría');

  await expect(rig).toHaveAttribute('data-rig-family', 'reading');
  await expect(rig).toHaveAttribute('data-gesture', 'audit-dossier');

  const eyes = rig.locator('[data-matthias-art-part="eyes"]');
  const arm = rig.locator('[data-matthias-art-part="right-arm"]');
  const prop = rig.locator('[data-matthias-art-part="prop"]');
  const eyesBefore = await center(eyes);
  const armBefore = await center(arm);
  const propBefore = await center(prop);

  await expect.poll(() => gestureCount(rig), { timeout: 2_000 }).toBeGreaterThan(0);
  const movingParts = await rig.evaluate((node) => Object.fromEntries(
    [...node.querySelectorAll('[data-matthias-art-part]')].map((part) => [part.dataset.matthiasArtPart, part.getAnimations().length]),
  ));
  expect(movingParts.head || 0).toBe(0);
  expect(movingParts.eyes).toBeGreaterThan(0);
  expect(movingParts['right-arm']).toBeGreaterThan(0);
  expect(movingParts.prop).toBeGreaterThan(0);

  await page.waitForTimeout(1400);
  expect(distance(eyesBefore, await center(eyes)), 'debe recorrer el expediente con la mirada').toBeGreaterThan(1.4);
  expect(distance(armBefore, await center(arm)), 'la mano debe acompañar la auditoría').toBeGreaterThan(2);
  expect(distance(propBefore, await center(prop)), 'el expediente debe levantarse perceptiblemente').toBeGreaterThan(1.5);
});

test('Home · Partida nocturna piensa con la mano hacia la barbilla, no sólo con los ojillos', async ({ page }) => {
  await setMatthiasHour(page, 22);
  const corner = await openHome(page);
  const matthias = corner.getByRole('button', { name: 'Abrir Así juegas con Matthias', exact: true });
  const { rig } = await expectLayeredCanonicalPortrait(matthias, 'partida nocturna');

  await expect(rig).toHaveAttribute('data-rig-family', 'ops');
  await expect(rig).toHaveAttribute('data-rig-activity', /Partida/i);
  await expect(rig).toHaveAttribute('data-gesture', 'board-move');

  const arm = rig.locator('[data-matthias-art-part="right-arm"]');
  const eyes = rig.locator('[data-matthias-art-part="eyes"]');
  const armBefore = await center(arm);
  const eyesBefore = await center(eyes);

  await expect.poll(() => gestureCount(rig), { timeout: 2_000 }).toBeGreaterThan(0);
  const movingParts = await rig.evaluate((node) => Object.fromEntries(
    [...node.querySelectorAll('[data-matthias-art-part]')].map((part) => [part.dataset.matthiasArtPart, part.getAnimations().length]),
  ));
  expect(movingParts.head || 0).toBe(0);
  expect(movingParts['left-arm'] || 0).toBe(0);
  expect(movingParts.prop || 0).toBe(0);
  expect(movingParts.eyes).toBeGreaterThan(0);
  expect(movingParts['right-arm']).toBeGreaterThan(0);

  await page.waitForTimeout(1450);
  const armDuring = await center(arm);
  expect(distance(armBefore, armDuring), 'la mano debe subir claramente hacia la barbilla').toBeGreaterThan(6);
  expect(armDuring.y, 'la mano debe viajar hacia arriba, no encogerse de lado').toBeLessThan(armBefore.y - 4);
  expect(distance(eyesBefore, await center(eyes)), 'la mirada también debe acompañar el pensamiento').toBeGreaterThan(1.5);
});

test('Home · Leyendo estrategia mantiene cuerpo y libro quietos y mueve sólo la mirada', async ({ page }) => {
  await setMatthiasHour(page, 23);
  const corner = await openHome(page);
  const matthias = corner.getByRole('button', { name: 'Abrir Así juegas con Matthias', exact: true });
  const { rig } = await expectLayeredCanonicalPortrait(matthias, 'leyendo estrategia');

  await expect(rig).toHaveAttribute('data-rig-family', 'reading');
  await expect(rig).toHaveAttribute('data-gesture', 'read-book');
  await expect.poll(() => gestureCount(rig), { timeout: 2_000 }).toBeGreaterThan(0);

  const movingParts = await rig.evaluate((node) => Object.fromEntries(
    [...node.querySelectorAll('[data-matthias-art-part]')].map((part) => [part.dataset.matthiasArtPart, part.getAnimations().length]),
  ));
  expect(movingParts.eyes).toBeGreaterThan(0);
  expect(movingParts.head || 0).toBe(0);
  expect(movingParts['left-arm'] || 0).toBe(0);
  expect(movingParts['right-arm'] || 0).toBe(0);
  expect(movingParts.prop || 0).toBe(0);
});

test('Home · el humo del café nocturno se mueve de verdad y no es decoración congelada', async ({ page }) => {
  await setMatthiasHour(page, 21);
  const corner = await openHome(page);
  const matthias = corner.getByRole('button', { name: 'Abrir Así juegas con Matthias', exact: true });
  await expectLayeredCanonicalPortrait(matthias, 'café nocturno');

  const steam = matthias.locator('[data-matthias-coffee-steam="true"]');
  const wisps = steam.locator('[data-matthias-coffee-wisp="true"]');
  await expect(steam).toBeVisible();
  await expect(steam).toHaveAttribute('data-steam-side', 'right');
  await expect(steam).toHaveAttribute('data-steam-motion', 'active');
  await expect(wisps).toHaveCount(3);

  const animationContract = await wisps.evaluateAll((nodes) => nodes.map((node) => {
    const animation = node.getAnimations()[0];
    const timing = animation?.effect?.getTiming?.() || {};
    return {
      count: node.getAnimations().length,
      state: animation?.playState,
      iterations: timing.iterations,
    };
  }));
  expect(animationContract.every((row) => row.count === 1)).toBe(true);
  expect(animationContract.every((row) => ['running', 'pending'].includes(row.state))).toBe(true);
  expect(animationContract.every((row) => row.iterations === Infinity)).toBe(true);

  const first = wisps.first();
  const before = await center(first);
  const opacityBefore = Number(await first.evaluate((node) => getComputedStyle(node).opacity));
  await page.waitForTimeout(550);
  const after = await center(first);
  const opacityAfter = Number(await first.evaluate((node) => getComputedStyle(node).opacity));
  expect(distance(before, after), 'el humo debe desplazarse físicamente').toBeGreaterThan(1.5);
  expect(Math.abs(opacityAfter - opacityBefore), 'el humo debe respirar también en opacidad').toBeGreaterThan(.04);
});

test('Home · sueño deja caer la cabeza y cierra visiblemente los ojos', async ({ page }) => {
  await setMatthiasHour(page, 2);
  const corner = await openHome(page);
  const matthias = corner.getByRole('button', { name: 'Abrir Así juegas con Matthias', exact: true });
  const { rig } = await expectLayeredCanonicalPortrait(matthias, 'sueño');

  await expect(rig).toHaveAttribute('data-rig-family', 'sleep');
  await expect(rig).toHaveAttribute('data-gesture', 'doze');

  const head = rig.locator('[data-matthias-art-part="head"]');
  const eyes = rig.locator('[data-matthias-art-part="eyes"]');
  const headBefore = await center(head);
  const eyesBefore = await box(eyes);

  await expect.poll(() => gestureCount(rig), { timeout: 2_000 }).toBeGreaterThan(0);
  await page.waitForTimeout(1700);

  expect(distance(headBefore, await center(head)), 'la cabeza debe vencerse de sueño').toBeGreaterThan(1.8);
  const eyesDuring = await box(eyes);
  expect(eyesDuring.height, 'los párpados deben cerrarse de forma perceptible').toBeLessThan(eyesBefore.height * .82);
});

test('Así juegas · el retrato de Matthias reutiliza el rig vivo en vez de quedarse como imagen funeraria', async ({ page }) => {
  await setMatthiasHour(page, 22);
  const corner = await openHome(page);
  await corner.getByRole('button', { name: 'Abrir Así juegas con Matthias', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Así juegas', exact: true })).toBeVisible();

  const livePortrait = page.locator('[data-insights-matthias-motion="true"]');
  const rig = livePortrait.locator('[data-matthias-layered-art="true"]');
  await expect(livePortrait).toBeVisible();
  await expect(rig).toBeVisible();
  await expect(rig).toHaveAttribute('data-gesture', 'board-move');
  await expect(rig.locator('img[data-matthias-canonical-art="true"]')).toHaveAttribute('src', /\.webp(?:$|\?)/);
  await expect.poll(() => gestureCount(rig), { timeout: 2_000 }).toBeGreaterThan(0);
  expect(await rig.locator('[data-matthias-art-part="right-arm"]').evaluate((node) => node.getAnimations().length)).toBeGreaterThan(0);
});

test('Home · el rig por capas también se activa en móvil sin mover la tarjeta', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await setMatthiasHour(page, 16);
  const corner = await openHome(page);
  await expect(corner).toHaveAttribute('data-placement', 'inline');

  const matthias = corner.getByRole('button', { name: 'Abrir Así juegas con Matthias', exact: true });
  const { frame, rig } = await expectLayeredCanonicalPortrait(matthias, 'móvil');
  const before = await center(frame);
  await expect.poll(() => gestureCount(rig), { timeout: 2_000 }).toBeGreaterThan(0);
  const after = await center(frame);
  expect(Math.abs(after.x - before.x)).toBeLessThan(1);
  expect(Math.abs(after.y - before.y)).toBeLessThan(1);
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
  await expect.poll(() => gestureCount(rig), { timeout: 2_000 }).toBeGreaterThan(0);
});

test('Home · una preferencia guardada de reducir movimiento sigue siendo reversible', async ({ page }) => {
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
  await expect.poll(() => gestureCount(rig), { timeout: 2_000 }).toBeGreaterThan(0);
});

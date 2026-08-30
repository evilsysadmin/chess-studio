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

async function openHome(page, { dismissSpeech = true, apiOptions = {} } = {}) {
  await mockApi(page, apiOptions);
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

function distance(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

async function gestureCount(rig) {
  return Number(await rig.getAttribute('data-gesture-count')) || 0;
}

async function movingPartCounts(rig) {
  return rig.evaluate((node) => Object.fromEntries(
    [...node.querySelectorAll('[data-matthias-art-part]')].map((part) => [
      part.dataset.matthiasArtPart,
      part.getAnimations().length,
    ]),
  ));
}

async function samplePartMotion(locator, progress = .45) {
  return locator.evaluate(async (node, requestedProgress) => {
    const animation = node.getAnimations()[0];
    if (!animation) return null;
    const timing = animation.effect?.getTiming?.() || {};
    const duration = Number(timing.duration) || 0;
    const delay = Math.max(0, Number(timing.delay) || 0);
    const settle = () => new Promise((resolve) => {
      requestAnimationFrame(() => requestAnimationFrame(resolve));
    });
    const measure = () => {
      const rect = node.getBoundingClientRect();
      return {
        x: rect.left + rect.width / 2,
        y: rect.top + rect.height / 2,
        width: rect.width,
        height: rect.height,
        opacity: Number(getComputedStyle(node).opacity),
        transform: getComputedStyle(node).transform,
      };
    };

    animation.pause();
    animation.currentTime = 0;
    await settle();
    const rest = measure();
    animation.currentTime = delay + duration * requestedProgress;
    await settle();
    const active = measure();
    return {
      rest,
      active,
      dx: active.x - rest.x,
      dy: active.y - rest.y,
      distance: Math.hypot(active.x - rest.x, active.y - rest.y),
      heightRatio: rest.height ? active.height / rest.height : 1,
    };
  }, progress);
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
  await expect.poll(() => gestureCount(rig), { timeout: 2_000 }).toBeGreaterThan(0);

  const parts = await movingPartCounts(rig);
  expect(parts.head || 0).toBe(0);
  expect(parts.eyes).toBeGreaterThan(0);
  expect(parts['right-arm']).toBeGreaterThan(0);
  expect(parts.prop || 0).toBe(0);

  const frameBefore = await center(frame);
  const eyeMotion = await samplePartMotion(rig.locator('[data-matthias-art-part="eyes"]'), .32);
  const armMotion = await samplePartMotion(rig.locator('[data-matthias-art-part="right-arm"]'), .30);
  expect(eyeMotion.distance, 'la mirada debe desplazarse claramente').toBeGreaterThan(2);
  expect(armMotion.distance, 'el brazo que escribe debe verse claramente').toBeGreaterThan(4);
  const frameAfter = await center(frame);
  expect(distance(frameBefore, frameAfter), 'el marco debe permanecer clavado').toBeLessThan(1);
});

test('Home · Auditoría táctica mueve mirada, mano y expediente, no el cráneo', async ({ page }) => {
  await setMatthiasHour(page, 17);
  const corner = await openHome(page);
  const matthias = corner.getByRole('button', { name: 'Abrir Así juegas con Matthias', exact: true });
  const { rig } = await expectLayeredCanonicalPortrait(matthias, 'auditoría');

  await expect(rig).toHaveAttribute('data-rig-family', 'reading');
  await expect(rig).toHaveAttribute('data-gesture', 'audit-dossier');
  await expect.poll(() => gestureCount(rig), { timeout: 2_000 }).toBeGreaterThan(0);
  const parts = await movingPartCounts(rig);
  expect(parts.head || 0).toBe(0);
  expect(parts.eyes).toBeGreaterThan(0);
  expect(parts['right-arm']).toBeGreaterThan(0);
  expect(parts.prop).toBeGreaterThan(0);

  const eyeMotion = await samplePartMotion(rig.locator('[data-matthias-art-part="eyes"]'), .24);
  const armMotion = await samplePartMotion(rig.locator('[data-matthias-art-part="right-arm"]'), .4);
  const propMotion = await samplePartMotion(rig.locator('[data-matthias-art-part="prop"]'), .45);
  expect(eyeMotion.distance, 'debe recorrer el expediente con la mirada').toBeGreaterThan(2.2);
  expect(armMotion.distance, 'la mano debe acompañar la auditoría').toBeGreaterThan(3.5);
  expect(propMotion.distance, 'el expediente debe levantarse perceptiblemente').toBeGreaterThan(2.4);
});

test('Home · Partida nocturna piensa con la mano hacia la barbilla, no sólo con los ojillos', async ({ page }) => {
  await setMatthiasHour(page, 22);
  const corner = await openHome(page);
  const matthias = corner.getByRole('button', { name: 'Abrir Así juegas con Matthias', exact: true });
  const { rig } = await expectLayeredCanonicalPortrait(matthias, 'partida nocturna');

  await expect(rig).toHaveAttribute('data-rig-family', 'ops');
  await expect(rig).toHaveAttribute('data-rig-activity', /Partida/i);
  await expect(rig).toHaveAttribute('data-gesture', 'board-move');
  await expect.poll(() => gestureCount(rig), { timeout: 2_000 }).toBeGreaterThan(0);
  const parts = await movingPartCounts(rig);
  expect(parts.head || 0).toBe(0);
  expect(parts['left-arm'] || 0).toBe(0);
  expect(parts.prop || 0).toBe(0);
  expect(parts.eyes).toBeGreaterThan(0);
  expect(parts['right-arm']).toBeGreaterThan(0);

  const armMotion = await samplePartMotion(rig.locator('[data-matthias-art-part="right-arm"]'), .46);
  const eyeMotion = await samplePartMotion(rig.locator('[data-matthias-art-part="eyes"]'), .3);
  expect(armMotion.distance, 'la mano debe subir claramente hacia la barbilla').toBeGreaterThan(8);
  expect(armMotion.dy, 'la mano debe viajar hacia arriba, no encogerse de lado').toBeLessThan(-6);
  expect(eyeMotion.distance, 'la mirada debe acompañar el pensamiento').toBeGreaterThan(2.4);
});

test('Home · Leyendo estrategia mantiene cuerpo y libro quietos y mueve sólo la mirada', async ({ page }) => {
  await setMatthiasHour(page, 23);
  const corner = await openHome(page);
  const matthias = corner.getByRole('button', { name: 'Abrir Así juegas con Matthias', exact: true });
  const { rig } = await expectLayeredCanonicalPortrait(matthias, 'leyendo estrategia');

  await expect(rig).toHaveAttribute('data-rig-family', 'reading');
  await expect(rig).toHaveAttribute('data-gesture', 'read-book');
  await expect.poll(() => gestureCount(rig), { timeout: 2_000 }).toBeGreaterThan(0);
  const parts = await movingPartCounts(rig);
  expect(parts.eyes).toBeGreaterThan(0);
  expect(parts.head || 0).toBe(0);
  expect(parts['left-arm'] || 0).toBe(0);
  expect(parts['right-arm'] || 0).toBe(0);
  expect(parts.prop || 0).toBe(0);
  const eyeMotion = await samplePartMotion(rig.locator('[data-matthias-art-part="eyes"]'), .22);
  expect(eyeMotion.distance).toBeGreaterThan(1.7);
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
    return { count: node.getAnimations().length, state: animation?.playState, iterations: timing.iterations };
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
  await expect.poll(() => gestureCount(rig), { timeout: 2_000 }).toBeGreaterThan(0);
  const headMotion = await samplePartMotion(rig.locator('[data-matthias-art-part="head"]'), .48);
  const eyeMotion = await samplePartMotion(rig.locator('[data-matthias-art-part="eyes"]'), .46);
  expect(headMotion.distance, 'la cabeza debe vencerse de sueño').toBeGreaterThan(4);
  expect(headMotion.dy, 'la cabeza debe caer hacia abajo').toBeGreaterThan(3);
  expect(eyeMotion.heightRatio, 'los párpados deben cerrarse de forma perceptible').toBeLessThan(.65);
});

test('Así juegas · el retrato de Matthias reutiliza el rig vivo en vez de quedarse como imagen funeraria', async ({ page }) => {
  await setMatthiasHour(page, 22);
  const playedGame = {
    id: 'e2e-insights-played-game',
    sourceGameId: 'e2e-insights-played-game',
    date: '2026-08-30T20:00:00Z',
    mode: 'casual',
    outcome: 'loss',
    humanColor: 'w',
    initialFen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
    moves: [
      { san: 'e4', from: 'e2', to: 'e4' },
      { san: 'e5', from: 'e7', to: 'e5' },
    ],
  };
  const corner = await openHome(page, {
    apiOptions: {
      profileSeed: {
        'chess-study-game-history': JSON.stringify([playedGame]),
      },
    },
  });
  await corner.getByRole('button', { name: 'Abrir Así juegas con Matthias', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Así juegas', exact: true })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Consulta diaria con Matthias' })).toBeVisible();

  const livePortrait = page.locator('[data-insights-matthias-motion="true"]');
  const rig = livePortrait.locator('[data-matthias-layered-art="true"]');
  await expect(livePortrait).toBeVisible({ timeout: 8_000 });
  await expect(rig).toBeVisible();
  await expect(rig).toHaveAttribute('data-gesture', 'board-move');
  await expect(rig.locator('img[data-matthias-canonical-art="true"]')).toHaveAttribute('src', /\.webp(?:$|\?)/);
  await expect.poll(() => gestureCount(rig), { timeout: 2_000 }).toBeGreaterThan(0);
  const armMotion = await samplePartMotion(rig.locator('[data-matthias-art-part="right-arm"]'), .46);
  expect(armMotion.distance).toBeGreaterThan(6);
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
  await samplePartMotion(rig.locator('[data-matthias-art-part="right-arm"]'), .3);
  const after = await center(frame);
  expect(distance(before, after)).toBeLessThan(1);
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

test('Home · una preferencia de perfil para reducir movimiento sigue siendo reversible', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  const corner = await openHome(page, {
    apiOptions: { profileSeed: { 'chess-study-reduced-motion': '1' } },
  });
  await expect(corner).toHaveAttribute('data-motion-state', 'reduced');
  await expect(corner).toHaveAttribute('data-motion-source', 'app');

  const matthias = corner.getByRole('button', { name: 'Abrir Así juegas con Matthias', exact: true });
  const { rig } = await expectLayeredCanonicalPortrait(matthias, 'preferencia de perfil');
  await expect(rig).toHaveAttribute('data-gesture-state', 'reduced');

  const enable = corner.getByRole('button', { name: 'Movimiento desactivado en Chess Studio · activar', exact: true });
  await enable.click();
  await expect(corner).toHaveAttribute('data-motion-state', 'active');
  await expect.poll(() => gestureCount(rig), { timeout: 2_000 }).toBeGreaterThan(0);
});
import { expect, test } from '@playwright/test';
import { login, mockApi } from './helpers.js';

async function dismissHomeGuide(page) {
  const guide = page.getByRole('region', { name: 'Guía rápida de Chess Studio' });
  if (await guide.isVisible().catch(() => false)) {
    await guide.getByRole('button', { name: 'Ahora no', exact: true }).click();
  }
}

async function openHomeAtHour(page, hour) {
  await page.addInitScript((fixedHour) => {
    Math.random = () => 0;
    Date.prototype.getHours = () => fixedHour;
  }, hour);
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await mockApi(page);
  await login(page);
  await dismissHomeGuide(page);

  const corner = page.getByRole('complementary', { name: 'Rincón de Matthias' });
  await expect(corner).toBeVisible();
  const dismiss = corner.getByRole('button', { name: 'Cerrar comentario de Matthias', exact: true });
  if (await dismiss.isVisible().catch(() => false)) await dismiss.click();
  return corner;
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

async function expectCanonicalLayeredAction(page, corner, {
  family,
  activity,
  gesture,
  movingParts,
  stationaryParts = [],
  upwardParts = [],
}) {
  const frame = corner.locator('[data-portrait-frame="true"]');
  const rig = frame.locator('[data-matthias-layered-art="true"]');
  const portrait = rig.locator('img[data-matthias-canonical-art="true"]');

  await expect(frame.locator('[data-matthias-frame-sequence="true"]')).toHaveCount(0);
  await expect(rig).toBeVisible();
  await expect(rig).toHaveAttribute('data-rig-family', family);
  if (activity) await expect(rig).toHaveAttribute('data-rig-activity', activity);
  await expect(rig).toHaveAttribute('data-gesture', gesture);
  await expect(portrait).toBeVisible();
  await expect(portrait).toHaveAttribute('src', /\.webp(?:$|\?)/);
  await expect.poll(
    () => portrait.evaluate((img) => img.complete && img.naturalWidth > 0 && img.naturalHeight > 0),
    { message: `${gesture}: el WebP canónico debe decodificar realmente` },
  ).toBe(true);

  const trackedParts = [...new Set([...movingParts, ...stationaryParts])];
  const before = Object.fromEntries(await Promise.all(
    trackedParts.map(async (part) => [part, await center(rig.locator(`[data-matthias-art-part="${part}"]`))]),
  ));

  await expect.poll(
    () => gestureCount(rig),
    { timeout: 2_000, message: `${gesture}: debe empezar el gesto poco después de entrar en Home` },
  ).toBeGreaterThan(0);
  await expect(rig).toHaveAttribute('data-gesture-state', 'acting');
  await page.waitForTimeout(1_250);

  const after = {};
  for (const part of trackedParts) {
    after[part] = await center(rig.locator(`[data-matthias-art-part="${part}"]`));
  }

  for (const part of movingParts) {
    expect(distance(before[part], after[part]), `${gesture}: ${part} debe desplazarse visiblemente`).toBeGreaterThan(1.5);
  }

  for (const part of upwardParts) {
    expect(after[part].y, `${gesture}: ${part} debe subir hacia la boca`).toBeLessThan(before[part].y - 1.5);
  }

  for (const part of stationaryParts) {
    expect(distance(before[part], after[part]), `${gesture}: ${part} debe permanecer quieto`).toBeLessThan(.35);
    const animationCount = await rig.locator(`[data-matthias-art-part="${part}"]`).evaluate((node) => node.getAnimations().length);
    expect(animationCount, `${gesture}: ${part} no debe recibir animación`).toBe(0);
  }

  const baseContract = await portrait.evaluate((node) => ({
    transform: getComputedStyle(node).transform,
    animations: node.getAnimations().length,
  }));
  expect(baseContract.transform).toBe('none');
  expect(baseContract.animations).toBe(0);
}

test('Home · café matinal sube taza y mano correctas hacia la boca', async ({ page }) => {
  const corner = await openHomeAtHour(page, 7);
  await expectCanonicalLayeredAction(page, corner, {
    family: 'coffee',
    gesture: 'sip',
    movingParts: ['right-arm', 'prop'],
    upwardParts: ['right-arm', 'prop'],
    stationaryParts: ['left-arm'],
  });
});

test('Home · café nocturno mueve la mano de la jarra y deja quieto el hombro contrario', async ({ page }) => {
  const corner = await openHomeAtHour(page, 21);
  await expectCanonicalLayeredAction(page, corner, {
    family: 'coffee',
    activity: 'Turno nocturno',
    gesture: 'sip-night',
    movingParts: ['right-arm', 'prop'],
    upwardParts: ['right-arm', 'prop'],
    stationaryParts: ['left-arm', 'head'],
  });
});

test('Home · cena de campaña sube el bocata sin comprimir cabeza ni ojos', async ({ page }) => {
  const corner = await openHomeAtHour(page, 20);
  await expectCanonicalLayeredAction(page, corner, {
    family: 'lunch',
    activity: 'Cena de campaña',
    gesture: 'bite',
    movingParts: ['left-arm', 'right-arm', 'prop'],
    upwardParts: ['left-arm', 'right-arm', 'prop'],
    stationaryParts: ['head', 'eyes'],
  });
});

test('Home · revisión de expedientes escanea el dossier sin mover el cráneo', async ({ page }) => {
  const corner = await openHomeAtHour(page, 10);
  await expectCanonicalLayeredAction(page, corner, {
    family: 'reading',
    activity: 'Revisión de expedientes',
    gesture: 'read-dossier',
    movingParts: ['eyes', 'right-arm'],
    stationaryParts: ['head', 'left-arm'],
  });
});

test('Home · auditoría táctica inspecciona el dossier con cabeza quieta', async ({ page }) => {
  const corner = await openHomeAtHour(page, 17);
  await expectCanonicalLayeredAction(page, corner, {
    family: 'reading',
    activity: 'Auditoría táctica',
    gesture: 'audit-dossier',
    movingParts: ['eyes', 'right-arm'],
    stationaryParts: ['head', 'left-arm'],
  });
});

test('Home · en plena operación escribe notas sin balancear cabeza ni otro brazo', async ({ page }) => {
  const corner = await openHomeAtHour(page, 16);
  await expectCanonicalLayeredAction(page, corner, {
    family: 'ops',
    activity: 'En plena operación',
    gesture: 'write-notes',
    movingParts: ['eyes', 'right-arm'],
    stationaryParts: ['head', 'left-arm', 'prop'],
  });
});

test('Home · partida privada usa un gesto de tablero y no el de tomar notas', async ({ page }) => {
  const corner = await openHomeAtHour(page, 15);
  await expectCanonicalLayeredAction(page, corner, {
    family: 'ops',
    activity: 'Partida privada',
    gesture: 'board-move',
    movingParts: ['eyes', 'right-arm'],
    stationaryParts: ['head', 'left-arm', 'prop'],
  });
});

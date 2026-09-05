import { expect, test } from '@playwright/test';
import { login, mockApi } from './helpers.js';

const MATTHIAS_LOGIN_GREETING_PENDING_KEY = 'chess-study-matthias-login-greeting-pending-v1';

async function dismissHomeGuide(page) {
  const guide = page.getByRole('region', { name: 'Guía rápida de Chess Studio' });
  if (await guide.isVisible().catch(() => false)) {
    await guide.getByRole('button', { name: 'Ahora no', exact: true }).click();
  }
}

async function dismissMatthiasSpeech(corner) {
  const bubble = corner.getByRole('region', { name: 'Mensaje de Matthias' });
  const dismiss = corner.getByRole('button', { name: 'Cerrar comentario de Matthias', exact: true });
  if (!(await bubble.isVisible().catch(() => false))) return;

  await dismiss.click({ timeout: 2_500 }).catch(() => {});
  if (await bubble.isVisible().catch(() => false)) {
    await dismiss.click({ force: true, timeout: 1_500 }).catch(() => {});
  }
  await expect(bubble).toBeHidden({ timeout: 5_000 });
}

async function openHomeAt(page, hour, { dismissSpeech = true, profileSeed = {} } = {}) {
  await page.addInitScript((fixedHour) => {
    Math.random = () => 0;
    Date.prototype.getHours = () => fixedHour;
  }, hour);
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await mockApi(page, {
    profileSeed: {
      'matthias.onboarded': '2',
      'chess-study-home-guide-dismissed-v1': '1',
      ...profileSeed,
    },
  });
  await login(page);
  await dismissHomeGuide(page);

  // The real login greeting intentionally expires after seven seconds. On a
  // saturated software-WebGL runner, login + Home bootstrap can consume that
  // entire window before a speech assertion starts. Requeue through the same
  // session signal used by an explicit login, then reload authenticated Home so
  // tests that explicitly request live speech receive a fresh real window.
  if (!dismissSpeech) {
    await page.evaluate((key) => sessionStorage.setItem(key, '1'), MATTHIAS_LOGIN_GREETING_PENDING_KEY);
    await page.reload();
    await dismissHomeGuide(page);
  }

  const corner = page.getByRole('complementary', { name: 'Rincón de Matthias' });
  await expect(corner).toBeVisible();
  await expect(corner).toHaveAttribute('data-three-presentation', 'home-v4');
  if (dismissSpeech) await dismissMatthiasSpeech(corner);
  return corner;
}

async function captureSpeechBubbleContract(corner) {
  let snapshot = null;
  await expect.poll(async () => {
    snapshot = await corner.evaluate((residentNode) => {
      const bubbleNode = residentNode.querySelector('[aria-label="Mensaje de Matthias"]');
      const characterNode = residentNode.querySelector('.matthias-resident__character');
      const avatarNode = residentNode.querySelector('[data-matthias-three-avatar="true"]');
      const textNode = bubbleNode?.querySelector('p');
      if (!bubbleNode?.isConnected || !textNode?.isConnected) return null;

      const fontSize = Number.parseFloat(getComputedStyle(textNode).fontSize);
      if (!Number.isFinite(fontSize)) return null;
      const bubbleRect = bubbleNode.getBoundingClientRect();
      const characterRect = characterNode?.getBoundingClientRect();
      return {
        gap: characterRect ? characterRect.left - bubbleRect.right : Number.POSITIVE_INFINITY,
        bubbleFontSize: fontSize,
        profile: avatarNode?.getAttribute('data-three-profile') || '',
        presenceState: avatarNode?.getAttribute('data-home-presence-state') || '',
        faceExpression: avatarNode?.getAttribute('data-three-face-expression') || '',
        mouthOpen: Number(avatarNode?.getAttribute('data-three-mouth-open')) || 0,
        faceArticulation: Number(avatarNode?.getAttribute('data-three-face-articulation')) || 0,
      };
    }).catch(() => null);
    return Boolean(snapshot);
  }, {
    timeout: 2_500,
    intervals: [50, 100, 200],
    message: 'el contrato del bocadillo debe capturarse mientras el nodo sigue conectado',
  }).toBe(true);
  return snapshot;
}

async function expectThreeScene(corner, profile, label, { minReach = 0, activityProp = null } = {}) {
  const frame = corner.locator('[data-portrait-frame="true"]');
  const avatar = frame.locator('[data-matthias-three-avatar="true"]');
  const canvas = avatar.locator('canvas');
  const fallback = avatar.locator('img[data-matthias-canonical-art="true"]');

  await expect(frame).toBeVisible();
  await expect(avatar).toBeVisible();
  await expect(avatar).toHaveAttribute('data-home-presence-version', 'home-presence-v1');
  await expect(avatar).toHaveAttribute('data-home-microgesture-version', 'home-face-v3-premium');
  await expect(avatar).toHaveAttribute('data-three-model', 'matthias-home-premium-3d-v1');
  await expect(avatar).toHaveAttribute('data-three-fidelity', 'approved-original-premium-v1');
  await expect(avatar).toHaveAttribute('data-three-render-mode', 'canonical-premium-pawn-3d');
  await expect(avatar).toHaveAttribute('data-three-render-contract', 'canonical-pawn-3d-v1');
  await expect(avatar).toHaveAttribute('data-three-approved-reference', 'approved-original-matthias-premium-v1');
  await expect(avatar).toHaveAttribute('data-three-full-3d', 'true');
  await expect(avatar).toHaveAttribute('data-three-emblem', 'premium-pawn');
  await expect(avatar).toHaveAttribute('data-three-art-version', 'angry-mock-v1');
  await expect(avatar).toHaveAttribute('data-three-profile', profile);
  await expect(avatar).toHaveAttribute('data-three-motion', 'active');
  await expect(avatar).toHaveAttribute('data-three-deformation', 'rigid-geometry+facial-rig');
  await expect(avatar).toHaveAttribute('data-three-face-rig', 'premium-pawn-face-v1');
  await expect(avatar).toHaveAttribute('data-three-articulated-face-rig', 'premium-pawn-face-v1');
  await expect(avatar).toHaveAttribute('data-three-face-warp-limit', '0.019');
  await expect(fallback).toHaveAttribute('src', /^(?:data:image\/webp;base64,|.*\.webp(?:$|\?))/);
  await expect.poll(
    () => fallback.evaluate((img) => img.complete && img.naturalWidth > 0 && img.naturalHeight > 0),
    { message: `${label}: el arte canónico debe seguir disponible como fallback` },
  ).toBe(true);

  await expect(frame.locator('[data-matthias-layered-art="true"]')).toHaveCount(0);
  await expect(frame.locator('[data-matthias-art-part]')).toHaveCount(0);
  await expect(frame.locator('[data-matthias-puppet="true"]')).toHaveCount(0);
  await expect.poll(() => avatar.getAttribute('data-three-ready'), { timeout: 4_000 }).toBe('true');
  await expect(avatar).toHaveAttribute('data-three-failed', 'false');
  await expect(canvas).toBeVisible();
  if (activityProp) {
    await expect.poll(
      () => avatar.getAttribute('data-three-activity-prop'),
      {
        timeout: 4_000,
        message: `${label}: el 3D debe conservar la utilería de la escena tras retirar el fallback`,
      },
    ).toBe(activityProp);
  }
  await expect.poll(async () => Number(await avatar.getAttribute('data-three-frame')) || 0, { timeout: 4_000 }).toBeGreaterThan(6);
  await expect.poll(async () => Number(await avatar.getAttribute('data-three-energy')) || 0, { timeout: 4_000 }).toBeGreaterThan(.08);
  await expect.poll(
    async () => Number(await avatar.getAttribute('data-three-face-articulation')) || 0,
    { timeout: 4_000, message: `${label}: el rig 3D debe recibir articulación real` },
  ).toBeGreaterThan(.003);
  const warp = Number(await avatar.getAttribute('data-three-face-warp')) || 0;
  expect(warp, `${label}: el modelo 3D nunca debe deformar píxeles`).toBeLessThanOrEqual(.019);
  if (minReach > 0) {
    await expect.poll(
      async () => Number(await avatar.getAttribute('data-three-reach')) || 0,
      { timeout: 4_500, message: `${label}: la actividad debe completar un gesto legible` },
    ).toBeGreaterThan(minReach);
  }

  const frameContract = await frame.evaluate((node) => ({
    transform: getComputedStyle(node).transform,
    animations: node.getAnimations().length,
  }));
  expect(frameContract.transform, `${label}: el marco no puede bailar con el avatar`).toBe('none');
  expect(frameContract.animations, `${label}: el movimiento debe vivir dentro de Three.js`).toBe(0);
  return avatar;
}

for (const [hour, profile, label, minReach, activityProp] of [
  [6, 'sip', 'primer café', .2, 'cup'],
  [7, 'sip', 'desayuno y prensa', .25, 'breakfast'],
  [12, 'bite', 'comida táctica', .3, 'ration'],
  [16, 'write', 'operación y notas', 0, 'write'],
  [17, 'dossier', 'auditoría del expediente', 0, 'dossier'],
  [19, 'sip', 'cervezota reglamentaria', .2, 'beer'],
  [22, 'think', 'partida privada', 0, 'chess'],
  [23, 'read', 'estudio y lectura', 0, 'book'],
  [2, 'sleep', 'sueño', 0, 'blanket'],
]) {
  test(`Home · Three.js anima ${label} con Matthias premium canónico`, async ({ page }) => {
    const corner = await openHomeAt(page, hour);
    await expectThreeScene(corner, profile, label, { minReach, activityProp });
  });
}

test('Home · lectura conserva microgestos faciales visibles y acotados', async ({ page }) => {
  const corner = await openHomeAt(page, 23);
  const avatar = await expectThreeScene(corner, 'read', 'microgestos de lectura');
  await expect(avatar).toHaveAttribute('data-three-face-expression', 'focus');
  await expect(avatar).toHaveAttribute('data-three-face-gesture', 'survey');
  await expect.poll(
    async () => Number(await avatar.getAttribute('data-three-head-yaw')) || 0,
    { timeout: 4_000, message: 'Home debe mover de verdad la cabeza/mirada del rig WebGL' },
  ).toBeGreaterThan(.02);
  const warp = Number(await avatar.getAttribute('data-three-face-warp')) || 0;
  expect(warp).toBeLessThanOrEqual(.019);
});

test('Home · cuando Matthias habla mantiene atención y señal facial mientras el mensaje está vivo', async ({ page }) => {
  const corner = await openHomeAt(page, 10, { dismissSpeech: false });
  const avatar = corner.locator('[data-matthias-three-avatar="true"]');
  const canvas = avatar.locator('canvas');

  const speech = await captureSpeechBubbleContract(corner);
  expect(speech.gap, 'el bocadillo debe pertenecer físicamente a Matthias').toBeGreaterThanOrEqual(0);
  expect(speech.gap, 'la cola no puede quedar flotando lejos de Matthias').toBeLessThanOrEqual(16);
  expect(speech.bubbleFontSize, 'el comentario de Matthias debe leerse sin forzar la vista').toBeGreaterThanOrEqual(13);
  expect(speech.profile, 'la foto tomada con el bocadillo vivo debe conservar el perfil de habla').toBe('speak');
  expect(speech.presenceState, 'la foto tomada con el bocadillo vivo debe mantener atención').toBe('attend');
  expect(speech.faceExpression, 'la foto tomada con el bocadillo vivo debe mantener la expresión de alerta').toBe('alert');
  expect(speech.mouthOpen, 'hablar debe tener señal de boca en la misma foto temporal').toBeGreaterThan(.2);
  expect(speech.faceArticulation, 'hablar debe articular cabeza/cara en la misma foto temporal').toBeGreaterThan(.02);

  await expect(avatar).toHaveAttribute('data-three-model', 'matthias-home-premium-3d-v1');
  await expect(avatar).toHaveAttribute('data-three-fidelity', 'approved-original-premium-v1');
  await expect(avatar).toHaveAttribute('data-three-render-mode', 'canonical-premium-pawn-3d');
  await expect.poll(() => avatar.getAttribute('data-three-ready'), { timeout: 4_000 }).toBe('true');
  await expect(canvas).toBeVisible();
});

test('Home · 390px conserva microgestos, mérito diegético, texto legible y cero overflow', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const corner = await openHomeAt(page, 10, {
    dismissSpeech: false,
    profileSeed: {
      'chess-study-achievements': JSON.stringify(['rating_master']),
    },
  });
  const home = page.locator('.menu.home-friendly');
  const primaryCard = home.locator('.home-mode-card').first();
  const castleLife = home.getByRole('region', { name: 'La estancia de Chess Studio' });
  const masterCrown = castleLife.locator('[data-castle-object="master-crown"]');

  await expect(home).toBeVisible();
  await expect(castleLife).toHaveAttribute('data-castle-life', 'real-state-v1');
  await expect(castleLife).toHaveAttribute('data-castle-honours', '1');
  await expect(masterCrown).toBeVisible();
  await expect(masterCrown).toHaveAttribute('data-castle-kind', 'honour');
  const speechContract = await captureSpeechBubbleContract(corner);
  await expect(primaryCard).toBeVisible();
  // Chromium resolves the responsive 13px token to 12.96px at this viewport on
  // some hosted runners; keep the readability floor while tolerating subpixel rounding.
  expect(speechContract.bubbleFontSize).toBeGreaterThanOrEqual(12.9);
  expect(speechContract.gap).toBeGreaterThanOrEqual(0);
  expect(speechContract.gap).toBeLessThanOrEqual(16);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
});

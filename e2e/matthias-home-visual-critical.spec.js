import { expect, test } from '@playwright/test';
import { login, mockApi } from './helpers.js';

async function dismissHomeGuide(page) {
  const guide = page.getByRole('region', { name: 'Guía rápida de Chess Studio' });
  if (await guide.isVisible().catch(() => false)) {
    await guide.getByRole('button', { name: 'Ahora no', exact: true }).click();
  }
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
  const corner = page.getByRole('complementary', { name: 'Rincón de Matthias' });
  await expect(corner).toBeVisible();
  await expect(corner).toHaveAttribute('data-three-presentation', 'home-v4');
  if (dismissSpeech) {
    const dismiss = corner.getByRole('button', { name: 'Cerrar comentario de Matthias', exact: true });
    if (await dismiss.isVisible().catch(() => false)) await dismiss.click();
  }
  return corner;
}

async function expectThreeScene(corner, profile, label, { minReach = 0 } = {}) {
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

for (const [hour, profile, label, minReach] of [
  [7, 'sip', 'café de campaña', .25],
  [12, 'bite', 'comida táctica', .3],
  [16, 'write', 'operación y notas', 0],
  [17, 'dossier', 'auditoría del expediente', 0],
  [22, 'think', 'partida privada', 0],
  [23, 'read', 'estudio y lectura', 0],
  [2, 'sleep', 'sueño', 0],
]) {
  test(`Home · Three.js anima ${label} con Matthias premium canónico`, async ({ page }) => {
    const corner = await openHomeAt(page, hour);
    await expectThreeScene(corner, profile, label, { minReach });
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
  const bubble = corner.getByRole('region', { name: 'Mensaje de Matthias' });
  const avatar = corner.locator('[data-matthias-three-avatar="true"]');
  const canvas = avatar.locator('canvas');

  await expect(bubble).toBeVisible();
  await expect(avatar).toHaveAttribute('data-three-model', 'matthias-home-premium-3d-v1');
  await expect(avatar).toHaveAttribute('data-three-fidelity', 'approved-original-premium-v1');
  await expect(avatar).toHaveAttribute('data-three-render-mode', 'canonical-premium-pawn-3d');
  await expect(avatar).toHaveAttribute('data-three-profile', 'speak');
  await expect(avatar).toHaveAttribute('data-home-presence-state', 'attend');
  await expect(avatar).toHaveAttribute('data-three-face-expression', 'alert');
  await expect.poll(() => avatar.getAttribute('data-three-ready'), { timeout: 4_000 }).toBe('true');
  await expect(canvas).toBeVisible();
  await expect.poll(
    async () => Number(await avatar.getAttribute('data-three-mouth-open')) || 0,
    { timeout: 2_500, message: 'hablar debe mantener una señal de boca activa' },
  ).toBeGreaterThan(.2);
  await expect.poll(
    async () => Number(await avatar.getAttribute('data-three-face-articulation')) || 0,
    { timeout: 2_500, message: 'hablar debe mantener articulación de cabeza/cara en el rig' },
  ).toBeGreaterThan(.02);

  const geometry = await corner.evaluate((node) => {
    const bubbleNode = node.querySelector('.matthias-resident__bubble');
    const characterNode = node.querySelector('.matthias-resident__character');
    const bubbleRect = bubbleNode?.getBoundingClientRect();
    const characterRect = characterNode?.getBoundingClientRect();
    return {
      gap: bubbleRect && characterRect ? characterRect.left - bubbleRect.right : Number.POSITIVE_INFINITY,
      bubbleFontSize: bubbleNode ? Number.parseFloat(getComputedStyle(bubbleNode.querySelector('p')).fontSize) : 0,
    };
  });
  expect(geometry.gap, 'el bocadillo debe pertenecer físicamente a Matthias').toBeGreaterThanOrEqual(0);
  expect(geometry.gap, 'la cola no puede quedar flotando lejos de Matthias').toBeLessThanOrEqual(16);
  expect(geometry.bubbleFontSize, 'el comentario de Matthias debe leerse sin forzar la vista').toBeGreaterThanOrEqual(13);
});

test('Home · 390px conserva microgestos, mérito diegético, texto legible y cero overflow', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const corner = await openHomeAt(page, 10, {
    dismissSpeech: false,
    profileSeed: {
      'chess-study-achievements': JSON.stringify(['rating_master']),
    },
  });
  const bubble = corner.getByRole('region', { name: 'Mensaje de Matthias' });
  const home = page.locator('.menu.home-friendly');
  const primaryCard = home.locator('.home-mode-card').first();
  const castleLife = home.getByRole('region', { name: 'La estancia de Chess Studio' });
  const masterCrown = castleLife.locator('[data-castle-object="master-crown"]');

  await expect(home).toBeVisible();
  await expect(castleLife).toHaveAttribute('data-castle-life', 'real-state-v1');
  await expect(castleLife).toHaveAttribute('data-castle-honours', '1');
  await expect(masterCrown).toBeVisible();
  await expect(masterCrown).toHaveAttribute('data-castle-kind', 'honour');
  await expect(bubble).toBeVisible();
  await expect(primaryCard).toBeVisible();
  await expect(corner).toHaveAttribute('data-placement', 'inline');
  const avatar = corner.locator('[data-matthias-three-avatar="true"]');
  await expect(avatar).toHaveAttribute('data-three-model', 'matthias-home-premium-3d-v1');
  await expect(avatar).toHaveAttribute('data-three-fidelity', 'approved-original-premium-v1');
  await expect(avatar).toHaveAttribute('data-three-render-mode', 'canonical-premium-pawn-3d');
  await expect(avatar).toHaveAttribute('data-three-emblem', 'premium-pawn');
  await expect(avatar).toHaveAttribute('data-three-deformation', 'rigid-geometry+facial-rig');
  await expect(avatar).toHaveAttribute('data-three-face-rig', 'premium-pawn-face-v1');
  await expect.poll(
    async () => Number(await avatar.getAttribute('data-three-face-articulation')) || 0,
    { timeout: 4_000 },
  ).toBeGreaterThan(.01);
  expect(Number(await avatar.getAttribute('data-three-face-warp')) || 0).toBeLessThanOrEqual(.019);

  const contract = await page.evaluate(() => {
    const bubbleText = document.querySelector('.matthias-resident__bubble p');
    const description = document.querySelector('.home-mode-description');
    const homeNode = document.querySelector('.menu.home-friendly');
    const homeStyle = homeNode ? getComputedStyle(homeNode) : null;
    const crown = document.querySelector('[data-castle-object="master-crown"]');
    const crownRect = crown?.getBoundingClientRect();
    return {
      overflow: document.documentElement.scrollWidth - window.innerWidth,
      bubbleFontSize: bubbleText ? Number.parseFloat(getComputedStyle(bubbleText).fontSize) : 0,
      descriptionFontSize: description ? Number.parseFloat(getComputedStyle(description).fontSize) : 0,
      homeBackground: homeStyle?.backgroundImage || '',
      crownLeft: crownRect?.left ?? -1,
      crownRight: crownRect?.right ?? Number.POSITIVE_INFINITY,
    };
  });

  expect(contract.overflow, 'Home no puede generar scroll horizontal en Android').toBeLessThanOrEqual(1);
  expect(contract.bubbleFontSize, 'Matthias debe seguir siendo legible a 390px').toBeGreaterThanOrEqual(12.8);
  expect(contract.descriptionFontSize, 'las descripciones de modos no pueden volver a microtexto').toBeGreaterThanOrEqual(12.5);
  expect(contract.crownLeft, 'el mérito diegético no puede salirse por la izquierda').toBeGreaterThanOrEqual(0);
  expect(contract.crownRight, 'el mérito diegético debe caber en Home a 390px').toBeLessThanOrEqual(390);
  expect(contract.homeBackground).toContain('linear-gradient');
});

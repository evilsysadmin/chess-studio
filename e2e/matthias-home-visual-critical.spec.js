import { expect, test } from '@playwright/test';
import { login, mockApi } from './helpers.js';

async function dismissHomeGuide(page) {
  const guide = page.getByRole('region', { name: 'Guía rápida de Chess Studio' });
  if (await guide.isVisible().catch(() => false)) {
    await guide.getByRole('button', { name: 'Ahora no', exact: true }).click();
  }
}

async function openHomeAt(page, hour, { dismissSpeech = true } = {}) {
  await page.addInitScript((fixedHour) => {
    Math.random = () => 0;
    Date.prototype.getHours = () => fixedHour;
  }, hour);
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await mockApi(page, {
    profileSeed: {
      'matthias.onboarded': '2',
      'chess-study-home-guide-dismissed-v1': '1',
    },
  });
  await login(page);
  await dismissHomeGuide(page);
  const corner = page.getByRole('complementary', { name: 'Rincón de Matthias' });
  await expect(corner).toBeVisible();
  await expect(corner).toHaveAttribute('data-three-presentation', 'home-v3');
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
  await expect(avatar).toHaveAttribute('data-three-profile', profile);
  await expect(avatar).toHaveAttribute('data-three-motion', 'active');
  await expect(avatar).toHaveAttribute('data-three-deformation', 'rigid-only');
  await expect(avatar).toHaveAttribute('data-three-face-rig', 'home-rigid-v1');
  await expect(avatar).toHaveAttribute('data-three-face-expression', 'canonical');
  await expect(avatar).toHaveAttribute('data-three-face-warp', '0.000');
  await expect(fallback).toHaveAttribute('src', /\.webp(?:$|\?)/);
  await expect.poll(
    () => fallback.evaluate((img) => img.complete && img.naturalWidth > 0 && img.naturalHeight > 0),
    { message: `${label}: el arte canónico debe decodificarse antes de entregarlo a WebGL` },
  ).toBe(true);

  await expect(frame.locator('[data-matthias-layered-art="true"]')).toHaveCount(0);
  await expect(frame.locator('[data-matthias-art-part]')).toHaveCount(0);
  await expect(frame.locator('[data-matthias-puppet="true"]')).toHaveCount(0);
  await expect.poll(() => avatar.getAttribute('data-three-ready'), { timeout: 4_000 }).toBe('true');
  await expect(avatar).toHaveAttribute('data-three-failed', 'false');
  await expect(canvas).toBeVisible();
  await expect.poll(async () => Number(await avatar.getAttribute('data-three-frame')) || 0, { timeout: 4_000 }).toBeGreaterThan(6);
  await expect.poll(async () => Number(await avatar.getAttribute('data-three-energy')) || 0, { timeout: 4_000 }).toBeGreaterThan(.08);
  if (minReach > 0) {
    await expect.poll(
      async () => Number(await avatar.getAttribute('data-three-reach')) || 0,
      { timeout: 4_500, message: `${label}: la actividad debe completar un gesto legible sin doblar la cara` },
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
  test(`Home · Three.js anima ${label} con pose rígida y cara canónica`, async ({ page }) => {
    const corner = await openHomeAt(page, hour);
    await expectThreeScene(corner, profile, label, { minReach });
  });
}

test('Home · cuando Matthias habla adopta atención antropomórfica sin lip-sync deformante', async ({ page }) => {
  const corner = await openHomeAt(page, 10, { dismissSpeech: false });
  const bubble = corner.getByRole('region', { name: 'Mensaje de Matthias' });
  await expect(bubble).toBeVisible();
  const avatar = await expectThreeScene(corner, 'speak', 'habla');
  await expect(avatar).toHaveAttribute('data-home-presence-state', 'attend');

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

test('Home · 390px mantiene materiales premium, texto legible y cero overflow', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const corner = await openHomeAt(page, 10, { dismissSpeech: false });
  const bubble = corner.getByRole('region', { name: 'Mensaje de Matthias' });
  const home = page.locator('.menu.home-friendly');
  const primaryCard = home.locator('.home-mode-card').first();

  await expect(home).toBeVisible();
  await expect(bubble).toBeVisible();
  await expect(primaryCard).toBeVisible();
  await expect(corner).toHaveAttribute('data-placement', 'inline');
  const avatar = corner.locator('[data-matthias-three-avatar="true"]');
  await expect(avatar).toHaveAttribute('data-three-deformation', 'rigid-only');
  await expect(avatar).toHaveAttribute('data-three-face-warp', '0.000');

  const contract = await page.evaluate(() => {
    const bubbleText = document.querySelector('.matthias-resident__bubble p');
    const description = document.querySelector('.home-mode-description');
    const homeNode = document.querySelector('.menu.home-friendly');
    const homeStyle = homeNode ? getComputedStyle(homeNode) : null;
    return {
      overflow: document.documentElement.scrollWidth - window.innerWidth,
      bubbleFontSize: bubbleText ? Number.parseFloat(getComputedStyle(bubbleText).fontSize) : 0,
      descriptionFontSize: description ? Number.parseFloat(getComputedStyle(description).fontSize) : 0,
      homeBackground: homeStyle?.backgroundImage || '',
    };
  });

  expect(contract.overflow, 'Home no puede generar scroll horizontal en Android').toBeLessThanOrEqual(1);
  expect(contract.bubbleFontSize, 'Matthias debe seguir siendo legible a 390px').toBeGreaterThanOrEqual(12.8);
  expect(contract.descriptionFontSize, 'las descripciones de modos no pueden volver a microtexto').toBeGreaterThanOrEqual(12.5);
  expect(contract.homeBackground).toContain('linear-gradient');
});
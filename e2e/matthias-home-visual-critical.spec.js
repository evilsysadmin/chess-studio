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
    // Este gate prueba la visita residente, no el onboarding. Sembramos un
    // perfil que ya conoce a Matthias para que el saludo explícito de login
    // quede disponible y no sea consumido por la Guía rápida.
    profileSeed: {
      'matthias.onboarded': '2',
      'chess-study-home-guide-dismissed-v1': '1',
    },
  });
  await login(page);
  await dismissHomeGuide(page);
  const corner = page.getByRole('complementary', { name: 'Rincón de Matthias' });
  await expect(corner).toBeVisible();
  if (dismissSpeech) {
    const dismiss = corner.getByRole('button', { name: 'Cerrar comentario de Matthias', exact: true });
    if (await dismiss.isVisible().catch(() => false)) await dismiss.click();
  }
  return corner;
}

async function expectThreeScene(corner, profile, label) {
  const frame = corner.locator('[data-portrait-frame="true"]');
  const avatar = frame.locator('[data-matthias-three-avatar="true"]');
  const canvas = avatar.locator('canvas');
  const fallback = avatar.locator('img[data-matthias-canonical-art="true"]');

  await expect(frame).toBeVisible();
  await expect(avatar).toBeVisible();
  await expect(avatar).toHaveAttribute('data-three-profile', profile);
  await expect(avatar).toHaveAttribute('data-three-motion', 'active');
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

  const frameContract = await frame.evaluate((node) => ({
    transform: getComputedStyle(node).transform,
    animations: node.getAnimations().length,
  }));
  expect(frameContract.transform, `${label}: el marco no puede bailar con el avatar`).toBe('none');
  expect(frameContract.animations, `${label}: el movimiento debe vivir dentro de Three.js`).toBe(0);
  return avatar;
}

for (const [hour, profile, label] of [
  [7, 'sip', 'café de campaña'],
  [12, 'bite', 'comida táctica'],
  [16, 'write', 'operación y notas'],
  [17, 'dossier', 'auditoría del expediente'],
  [22, 'think', 'partida privada'],
  [23, 'read', 'estudio y lectura'],
  [2, 'sleep', 'sueño'],
]) {
  test(`Home · Three.js anima ${label} sin recomponer a Matthias por capas`, async ({ page }) => {
    const corner = await openHomeAt(page, hour);
    await expectThreeScene(corner, profile, label);
  });
}

test('Home · cuando Matthias habla Three.js usa un perfil de atención y conserva el arte original', async ({ page }) => {
  const corner = await openHomeAt(page, 10, { dismissSpeech: false });
  const bubble = corner.getByRole('region', { name: 'Mensaje de Matthias' });
  await expect(bubble).toBeVisible();
  await expectThreeScene(corner, 'speak', 'habla');
});

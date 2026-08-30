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

async function expectCanonicalLayeredAction(page, corner, { family, gesture, movingParts }) {
  const frame = corner.locator('[data-portrait-frame="true"]');
  const rig = frame.locator('[data-matthias-layered-art="true"]');
  const portrait = rig.locator('img[data-matthias-canonical-art="true"]');

  await expect(frame.locator('[data-matthias-frame-sequence="true"]')).toHaveCount(0);
  await expect(rig).toBeVisible();
  await expect(rig).toHaveAttribute('data-rig-family', family);
  await expect(rig).toHaveAttribute('data-gesture', gesture);
  await expect(portrait).toBeVisible();
  await expect(portrait).toHaveAttribute('src', /\.webp(?:$|\?)/);
  await expect.poll(
    () => portrait.evaluate((img) => img.complete && img.naturalWidth > 0 && img.naturalHeight > 0),
    { message: `${gesture}: el WebP canónico debe decodificar realmente` },
  ).toBe(true);

  const before = Object.fromEntries(await Promise.all(
    movingParts.map(async (part) => [part, await center(rig.locator(`[data-matthias-art-part="${part}"]`))]),
  ));

  await expect.poll(
    () => gestureCount(rig),
    { timeout: 2_000, message: `${gesture}: debe empezar el gesto poco después de entrar en Home` },
  ).toBeGreaterThan(0);
  await expect(rig).toHaveAttribute('data-gesture-state', 'acting');
  await page.waitForTimeout(1_250);

  for (const part of movingParts) {
    const after = await center(rig.locator(`[data-matthias-art-part="${part}"]`));
    expect(distance(before[part], after), `${gesture}: ${part} debe desplazarse visiblemente`).toBeGreaterThan(1.5);
  }

  const baseContract = await portrait.evaluate((node) => ({
    transform: getComputedStyle(node).transform,
    animations: node.getAnimations().length,
  }));
  expect(baseContract.transform).toBe('none');
  expect(baseContract.animations).toBe(0);
}

test('Home · café matinal usa el WebP canónico y un gesto de beber visible', async ({ page }) => {
  const corner = await openHomeAtHour(page, 7);
  await expectCanonicalLayeredAction(page, corner, {
    family: 'coffee',
    gesture: 'sip',
    movingParts: ['left-arm', 'prop'],
  });
});

test('Home · café nocturno también se mueve y no vuelve al sprite', async ({ page }) => {
  const corner = await openHomeAtHour(page, 21);
  await expectCanonicalLayeredAction(page, corner, {
    family: 'coffee',
    gesture: 'sip',
    movingParts: ['left-arm', 'prop'],
  });
});

test('Home · cena de campaña usa el WebP completo y un gesto de comer visible', async ({ page }) => {
  const corner = await openHomeAtHour(page, 20);
  await expectCanonicalLayeredAction(page, corner, {
    family: 'lunch',
    gesture: 'bite',
    movingParts: ['left-arm', 'right-arm', 'prop'],
  });
});

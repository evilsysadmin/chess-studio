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

async function decodedSpriteWidth(page, sequence) {
  const spriteUrl = await sequence.locator('[data-frame-layer]').first().evaluate((node) => {
    const background = getComputedStyle(node).backgroundImage;
    const match = /^url\(["']?(.*?)["']?\)$/.exec(background);
    return match?.[1] || '';
  });

  expect(spriteUrl).toBeTruthy();
  return page.evaluate((src) => new Promise((resolve) => {
    const image = new Image();
    image.onload = () => resolve(image.naturalWidth);
    image.onerror = () => resolve(0);
    image.src = src;
  }), spriteUrl);
}

async function expectFrameAction(page, corner, { family, action }) {
  const sequence = corner.locator('[data-matthias-frame-sequence="true"]');
  await expect(sequence).toBeVisible();
  await expect(sequence).toHaveAttribute('data-sequence-family', family);
  await expect(sequence).toHaveAttribute('data-sequence-action', action);
  await expect(sequence.locator('[data-matthias-art-part]')).toHaveCount(0);
  await expect(sequence.locator('[data-frame-layer]')).toHaveCount(2);
  await expect(sequence.locator('[data-sequence-fallback="true"]')).toHaveCount(1);

  await expect.poll(
    async () => decodedSpriteWidth(page, sequence),
    { timeout: 3_500, message: `${action}: el WebP del sprite debe decodificar de verdad` },
  ).toBeGreaterThan(0);
  await expect(sequence).toHaveAttribute('data-sprite-state', 'ready');

  await expect.poll(
    async () => Number(await sequence.getAttribute('data-sequence-cycle-count')),
    { timeout: 3_500, message: `${action}: debe arrancar una acción completa tras una pausa breve` },
  ).toBeGreaterThan(0);

  await expect.poll(
    async () => Number(await sequence.getAttribute('data-frame-index')),
    { timeout: 4_500, message: `${action}: debe avanzar a otro fotograma real` },
  ).toBeGreaterThan(0);

  await expect(sequence).toHaveAttribute('data-sequence-state', 'acting');
}

test('Home · Matthias levanta la taza y bebe mediante fotogramas completos', async ({ page }) => {
  const corner = await openHomeAtHour(page, 7);
  await expectFrameAction(page, corner, { family: 'coffee', action: 'drink' });
});

test('Home · Matthias acerca la comida y come mediante fotogramas completos', async ({ page }) => {
  const corner = await openHomeAtHour(page, 12);
  await expectFrameAction(page, corner, { family: 'lunch', action: 'eat' });
});

test('Home · si el sprite no carga, Matthias conserva el arte canónico estático', async ({ page }) => {
  await page.route('**/*coffee-sprite.webp*', (route) => route.abort());
  const corner = await openHomeAtHour(page, 7);
  const sequence = corner.locator('[data-matthias-frame-sequence="true"]');

  await expect(sequence).toHaveAttribute('data-sequence-family', 'coffee');
  await expect(sequence).toHaveAttribute('data-sprite-state', 'error');
  await expect(sequence).toHaveAttribute('data-sequence-state', 'fallback');
  await expect(sequence.locator('[data-sequence-fallback="true"]')).toBeVisible();
  await expect(sequence.locator('[data-sequence-fallback="true"]')).toHaveAttribute('data-matthias-canonical-art', 'true');
  await expect(sequence).toHaveAttribute('data-sequence-cycle-count', '0');
});

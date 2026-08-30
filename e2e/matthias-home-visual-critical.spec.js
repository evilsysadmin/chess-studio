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

async function motionSpan(page, layer) {
  const samples = [];
  for (let i = 0; i < 12; i += 1) {
    samples.push(await layer.evaluate((node) => {
      const rect = node.getBoundingClientRect();
      return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
    }));
    await page.waitForTimeout(180);
  }
  const xs = samples.map((sample) => sample.x);
  const ys = samples.map((sample) => sample.y);
  return Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys));
}

async function expectPortraitMotion(page, layer, image, label) {
  await expect(layer).toBeVisible();
  await expect(image).toBeVisible();

  await expect.poll(
    () => layer.evaluate((node) => node.getAnimations().some((animation) => animation.playState === 'running')),
    { message: `${label}: la capa de Matthias debe tener una animación compositor real` },
  ).toBe(true);

  expect(
    await motionSpan(page, layer),
    `${label}: Matthias debe desplazarse de forma claramente visible, no una microanimación testimonial`,
  ).toBeGreaterThan(8);
}

test('Home · Matthias carga, se mueve de forma claramente perceptible en desktop y móvil y abre Así juegas', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await mockApi(page);
  await login(page);
  await dismissHomeGuide(page);

  const corner = page.getByRole('complementary', { name: 'Rincón de Matthias' });
  await expect(corner).toBeVisible();
  await dismissMatthiasSpeech(corner);

  const matthias = corner.getByRole('button', { name: 'Abrir Así juegas con Matthias', exact: true });
  await expect(matthias).toBeVisible();

  const portrait = matthias.locator('img');
  const motionLayer = matthias.locator('[data-motion-layer="true"]');
  await expect(portrait).toBeVisible();
  await expect.poll(
    () => portrait.evaluate((img) => img.complete && img.naturalWidth > 0 && img.naturalHeight > 0),
    { message: 'El retrato de Matthias debe haberse decodificado realmente' },
  ).toBe(true);

  await expect(corner).toHaveAttribute('data-placement', 'viewport');
  await expect(corner).toHaveAttribute('data-motion-state', 'active');
  await expectPortraitMotion(page, motionLayer, portrait, 'desktop');

  await page.setViewportSize({ width: 390, height: 844 });
  await expect(corner).toHaveAttribute('data-placement', 'inline');
  await expectPortraitMotion(page, motionLayer, portrait, 'móvil');

  await matthias.click();
  await expect(page.getByRole('heading', { name: 'Así juegas', exact: true })).toBeVisible();
});

test('Home · si el sistema congela animaciones explica por qué y permite activarlas explícitamente', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await mockApi(page);
  await login(page);
  await dismissHomeGuide(page);

  const corner = page.getByRole('complementary', { name: 'Rincón de Matthias' });
  await expect(corner).toBeVisible();
  await dismissMatthiasSpeech(corner);
  await expect(corner).toHaveAttribute('data-motion-state', 'reduced');
  await expect(corner).toHaveAttribute('data-motion-source', 'system');

  const enable = corner.getByRole('button', { name: 'Movimiento desactivado por el sistema · activar', exact: true });
  await expect(enable).toBeVisible();
  await enable.click();

  await expect(corner).toHaveAttribute('data-motion-state', 'active');
  await expect(corner).toHaveAttribute('data-motion-source', 'app');
  await expect.poll(() => page.evaluate(() => document.documentElement.dataset.motionPreference)).toBe('allow');

  const motionLayer = corner.locator('[data-motion-layer="true"]');
  expect(await motionSpan(page, motionLayer), 'el override explícito debe mover físicamente a Matthias aunque el sistema pida reduce').toBeGreaterThan(8);
});

test('Home · una preferencia guardada de reducir movimiento no deja a Matthias congelado sin explicación', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.addInitScript(() => localStorage.setItem('chess-study-reduced-motion', '1'));
  await mockApi(page);
  await login(page);
  await dismissHomeGuide(page);

  const corner = page.getByRole('complementary', { name: 'Rincón de Matthias' });
  await expect(corner).toBeVisible();
  await dismissMatthiasSpeech(corner);
  await expect(corner).toHaveAttribute('data-motion-state', 'reduced');
  await expect(corner).toHaveAttribute('data-motion-source', 'app');

  const enable = corner.getByRole('button', { name: 'Movimiento desactivado en Chess Studio · activar', exact: true });
  await expect(enable).toBeVisible();
  await enable.click();

  await expect(corner).toHaveAttribute('data-motion-state', 'active');
  const motionLayer = corner.locator('[data-motion-layer="true"]');
  expect(await motionSpan(page, motionLayer), 'activar movimiento desde una preferencia guardada debe devolver vida visible a Matthias').toBeGreaterThan(8);
});

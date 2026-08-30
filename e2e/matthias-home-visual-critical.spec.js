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

async function expectPortraitMotion(page, layer, frame, image, label) {
  await expect(frame).toBeVisible();
  await expect(layer).toBeVisible();
  await expect(image).toBeVisible();

  await expect.poll(
    () => layer.evaluate((node) => node.getAnimations().some((animation) => animation.playState === 'running')),
    { message: `${label}: la capa enmascarada de Matthias debe tener una animación compositor real` },
  ).toBe(true);

  const structure = await frame.evaluate((node) => {
    const style = getComputedStyle(node);
    return {
      animationName: style.animationName,
      transform: style.transform,
      backgroundImage: style.backgroundImage,
      ownAnimations: node.getAnimations().length,
    };
  });
  expect(structure.animationName, `${label}: el frame no puede tener una animación CSS`).toBe('none');
  expect(structure.transform, `${label}: el frame no puede tener transform`).toBe('none');
  expect(structure.ownAnimations, `${label}: el frame no puede tener animaciones directas`).toBe(0);
  expect(structure.backgroundImage, `${label}: la escena completa debe quedar fija como fondo del frame`).toContain('url(');

  const layerStructure = await layer.evaluate((node) => {
    const style = getComputedStyle(node);
    return {
      parentIsFrame: node.parentElement?.dataset.portraitFrame === 'true',
      position: style.position,
      maskImage: style.maskImage || style.webkitMaskImage || 'none',
    };
  });
  expect(layerStructure.parentIsFrame, `${label}: la capa animada debe vivir dentro del frame`).toBe(true);
  expect(layerStructure.position, `${label}: el overlay animado no puede participar en layout`).toBe('absolute');
  expect(layerStructure.maskImage, `${label}: el overlay debe estar enmascarado para que no se mueva un rectángulo opaco`).not.toBe('none');

  const imageStructure = await image.evaluate((node) => {
    const style = getComputedStyle(node);
    return {
      animationName: style.animationName,
      transform: style.transform,
      ownAnimations: node.getAnimations().length,
    };
  });
  expect(imageStructure.animationName, `${label}: el bitmap completo no puede tener animación propia`).toBe('none');
  expect(imageStructure.transform, `${label}: el bitmap completo no puede transformarse directamente`).toBe('none');
  expect(imageStructure.ownAnimations, `${label}: el bitmap completo no puede tener animaciones directas`).toBe(0);

  expect(
    await motionSpan(page, layer),
    `${label}: la silueta enmascarada de Matthias debe moverse de forma visible`,
  ).toBeGreaterThan(3);

  expect(
    await motionSpan(page, frame),
    `${label}: el marco del retrato debe permanecer inmóvil mientras Matthias se mueve dentro`,
  ).toBeLessThan(1);
}

test('Home · Matthias se mueve como personaje sobre una escena fija en desktop y móvil y abre Así juegas', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await mockApi(page);
  await login(page);
  await dismissHomeGuide(page);

  const corner = page.getByRole('complementary', { name: 'Rincón de Matthias' });
  await expect(corner).toBeVisible();
  await dismissMatthiasSpeech(corner);

  const matthias = corner.getByRole('button', { name: 'Abrir Así juegas con Matthias', exact: true });
  await expect(matthias).toBeVisible();

  const portrait = matthias.locator('[data-motion-art="true"]');
  const frame = matthias.locator('[data-portrait-frame="true"]');
  const motionLayer = matthias.locator('[data-motion-layer="true"]');
  await expect(portrait).toBeVisible();
  await expect.poll(
    () => portrait.evaluate((img) => img.complete && img.naturalWidth > 0 && img.naturalHeight > 0),
    { message: 'El arte de Matthias debe haberse decodificado realmente' },
  ).toBe(true);

  await expect(corner).toHaveAttribute('data-placement', 'viewport');
  await expect(corner).toHaveAttribute('data-motion-state', 'active');
  await expect(frame).toHaveAttribute('data-static-scene', 'true');
  await expectPortraitMotion(page, motionLayer, frame, portrait, 'desktop');

  await page.setViewportSize({ width: 390, height: 844 });
  await expect(corner).toHaveAttribute('data-placement', 'inline');
  await expectPortraitMotion(page, motionLayer, frame, portrait, 'móvil');

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

  const frame = corner.locator('[data-portrait-frame="true"]');
  const motionLayer = corner.locator('[data-motion-layer="true"]');
  const portrait = corner.locator('[data-motion-art="true"]');
  await expectPortraitMotion(page, motionLayer, frame, portrait, 'override del sistema');
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
  const frame = corner.locator('[data-portrait-frame="true"]');
  const motionLayer = corner.locator('[data-motion-layer="true"]');
  const portrait = corner.locator('[data-motion-art="true"]');
  await expectPortraitMotion(page, motionLayer, frame, portrait, 'override de preferencia guardada');
});

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

async function frameCenter(frame) {
  return frame.evaluate((node) => {
    const rect = node.getBoundingClientRect();
    return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
  });
}

async function expectHumanGesture(page, layer, frame, image, label) {
  await expect(frame).toBeVisible();
  await expect(layer).toBeVisible();
  await expect(image).toBeVisible();

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
  expect(layerStructure.parentIsFrame, `${label}: la capa gestual debe vivir dentro del frame`).toBe(true);
  expect(layerStructure.position, `${label}: el overlay gestual no puede participar en layout`).toBe('absolute');
  expect(layerStructure.maskImage, `${label}: el overlay debe estar enmascarado para no mover un rectángulo opaco`).not.toBe('none');

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

  await expect(layer).toHaveAttribute('data-motion-behavior', 'human-gestures');
  const before = await frameCenter(frame);

  await expect.poll(
    () => layer.getAttribute('data-gesture-state'),
    { timeout: 5500, message: `${label}: Matthias debe hacer un gesto humano puntual tras una pausa` },
  ).toBe('acting');

  const gesture = await layer.evaluate((node) => {
    const animation = node.getAnimations().find((candidate) => candidate.playState === 'running');
    const timing = animation?.effect?.getTiming?.();
    const frames = animation?.effect?.getKeyframes?.() || [];
    return {
      kind: node.dataset.gestureKind,
      transform: getComputedStyle(node).transform,
      iterations: timing?.iterations,
      duration: Number(timing?.duration || 0),
      transforms: frames.map((frame) => String(frame.transform || '')),
    };
  });

  expect(gesture.kind, `${label}: el gesto debe tener semántica humana`).toBeTruthy();
  expect(gesture.transform, `${label}: durante el gesto la silueta debe cambiar de postura`).not.toBe('none');
  expect(gesture.iterations, `${label}: el gesto no puede ser un idle loop`).toBe(1);
  expect(gesture.duration, `${label}: el gesto debe ser corto`).toBeGreaterThanOrEqual(1200);
  expect(gesture.duration, `${label}: el gesto no debe convertirse en balanceo continuo`).toBeLessThanOrEqual(2100);
  expect(
    gesture.transforms.every((transform) => !/translateY|translate3d/.test(transform)),
    `${label}: ningún gesto puede volver a hacer rebotar verticalmente a Matthias`,
  ).toBe(true);

  const during = await frameCenter(frame);
  expect(Math.abs(during.x - before.x), `${label}: el frame debe permanecer clavado en X`).toBeLessThan(1);
  expect(Math.abs(during.y - before.y), `${label}: el frame debe permanecer clavado en Y`).toBeLessThan(1);

  await expect.poll(
    () => layer.getAttribute('data-gesture-state'),
    { timeout: 3500, message: `${label}: tras el gesto Matthias debe volver a quedarse quieto` },
  ).toBe('rest');
  await expect.poll(() => layer.evaluate((node) => node.getAnimations().length)).toBe(0);
}

async function openHome(page) {
  await mockApi(page);
  await login(page);
  await dismissHomeGuide(page);
  const corner = page.getByRole('complementary', { name: 'Rincón de Matthias' });
  await expect(corner).toBeVisible();
  await dismissMatthiasSpeech(corner);
  return corner;
}

test('Home · Matthias hace gestos humanos puntuales sobre una escena fija en desktop y abre Así juegas', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  const corner = await openHome(page);

  const matthias = corner.getByRole('button', { name: 'Abrir Así juegas con Matthias', exact: true });
  const portrait = matthias.locator('[data-motion-art="true"]');
  const frame = matthias.locator('[data-portrait-frame="true"]');
  const motionLayer = matthias.locator('[data-motion-layer="true"]');

  await expect.poll(
    () => portrait.evaluate((img) => img.complete && img.naturalWidth > 0 && img.naturalHeight > 0),
    { message: 'El arte de Matthias debe haberse decodificado realmente' },
  ).toBe(true);
  await expect(corner).toHaveAttribute('data-placement', 'viewport');
  await expect(corner).toHaveAttribute('data-motion-state', 'active');
  await expect(frame).toHaveAttribute('data-static-scene', 'true');
  await expectHumanGesture(page, motionLayer, frame, portrait, 'desktop');

  await matthias.click();
  await expect(page.getByRole('heading', { name: 'Así juegas', exact: true })).toBeVisible();
});

test('Home · Matthias conserva el gesto humano one-shot en móvil', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  const corner = await openHome(page);
  await expect(corner).toHaveAttribute('data-placement', 'inline');

  const matthias = corner.getByRole('button', { name: 'Abrir Así juegas con Matthias', exact: true });
  await expectHumanGesture(
    page,
    matthias.locator('[data-motion-layer="true"]'),
    matthias.locator('[data-portrait-frame="true"]'),
    matthias.locator('[data-motion-art="true"]'),
    'móvil',
  );
});

test('Home · si el sistema congela animaciones explica por qué y permite activarlas explícitamente', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const corner = await openHome(page);
  await expect(corner).toHaveAttribute('data-motion-state', 'reduced');
  await expect(corner).toHaveAttribute('data-motion-source', 'system');

  const enable = corner.getByRole('button', { name: 'Movimiento desactivado por el sistema · activar', exact: true });
  await expect(enable).toBeVisible();
  await enable.click();

  await expect(corner).toHaveAttribute('data-motion-state', 'active');
  await expect(corner).toHaveAttribute('data-motion-source', 'app');
  await expect.poll(() => page.evaluate(() => document.documentElement.dataset.motionPreference)).toBe('allow');

  await expectHumanGesture(
    page,
    corner.locator('[data-motion-layer="true"]'),
    corner.locator('[data-portrait-frame="true"]'),
    corner.locator('[data-motion-art="true"]'),
    'override del sistema',
  );
});

test('Home · una preferencia guardada de reducir movimiento no deja a Matthias congelado sin explicación', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.addInitScript(() => localStorage.setItem('chess-study-reduced-motion', '1'));
  const corner = await openHome(page);
  await expect(corner).toHaveAttribute('data-motion-state', 'reduced');
  await expect(corner).toHaveAttribute('data-motion-source', 'app');

  const enable = corner.getByRole('button', { name: 'Movimiento desactivado en Chess Studio · activar', exact: true });
  await expect(enable).toBeVisible();
  await enable.click();

  await expect(corner).toHaveAttribute('data-motion-state', 'active');
  await expectHumanGesture(
    page,
    corner.locator('[data-motion-layer="true"]'),
    corner.locator('[data-portrait-frame="true"]'),
    corner.locator('[data-motion-art="true"]'),
    'override de preferencia guardada',
  );
});

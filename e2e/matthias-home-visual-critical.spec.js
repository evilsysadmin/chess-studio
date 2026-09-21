import { expect, test } from '@playwright/test';
import { login, mockApi } from './helpers.js';

async function openCanonicalHome(page, { reducedMotion = 'no-preference', profileSeed = {} } = {}) {
  await page.emulateMedia({ reducedMotion });
  await mockApi(page, {
    profileSeed: {
      'matthias.onboarded': '2',
      'chess-study-home-guide-dismissed-v1': '1',
      ...profileSeed,
    },
  });
  await login(page);

  const home = page.getByRole('region', { name: 'Modos principales' });
  await expect(home).toBeVisible();
  await expect(home.locator('.illustrated-home__stage')).toBeVisible();
  return home;
}

function matthiasRig(matthias) {
  const avatar = matthias.locator('.illustrated-home__matthias-portrait [data-home-matthias-3d]');
  return {
    avatar,
    image: avatar.locator('img[data-matthias-fallback="canonical-scene-render"]'),
    canvas: avatar.locator('canvas[data-matthias-canonical-model="blender"]'),
  };
}

async function expectBlenderRigReady(avatar, canvas) {
  await expect(avatar).toHaveAttribute('data-home-matthias-model-state', 'ready', { timeout: 15_000 });
  await expect(avatar).toHaveAttribute('data-matthias-identity', 'canonical-blender-rig');
  await expect(avatar).toHaveAttribute('data-matthias-render-source', 'blender-glb');
  await expect(canvas).toBeVisible();
  await expect(canvas).toHaveCSS('opacity', '1');
  await expect(canvas).toHaveAttribute('data-matthias-camera-facing', 'visible-front-geometry');
  await expect(canvas).toHaveAttribute('data-matthias-camera-contract', 'visible-front-geometry');
  await expect(canvas).toHaveAttribute('data-matthias-camera-distance', /^\d+\.\d{3}$/);
}

test('Home canónica · Matthias permanece visible, vivo y abre Así juegas', async ({ page }) => {
  const home = await openCanonicalHome(page);
  const matthias = home.locator('.illustrated-home__matthias');
  const { avatar, image, canvas } = matthiasRig(matthias);

  await expect(matthias).toBeVisible();
  await expect(matthias).toContainText('MATTHIAS');
  await expect(matthias).toHaveAttribute('data-home-matthias-scene', /.+/);
  await expect(matthias).toHaveAttribute('data-home-matthias-activity', /.+/);
  await expect(matthias).toHaveAttribute('data-home-matthias-dwell-ms', /^(34000|38000|42000|44000|48000|64000)$/);
  await expect(avatar).toHaveAttribute('data-home-matthias-3d', 'ready');
  await expect(avatar).toHaveAttribute('data-motion', 'rigged-gltf-clips');
  await expectBlenderRigReady(avatar, canvas);
  await expect(image).toBeVisible();
  await expect(image).toHaveCSS('opacity', '0');
  await expect(avatar.locator('[data-matthias-layered-art="true"]')).toHaveCount(0);

  // Matthias is a resident of the hall, not a permanent profile card. Keep the
  // semantic copy in the DOM, but surface his current activity only on intent.
  await expect(matthias.locator('.illustrated-home__matthias-copy')).toHaveCSS('display', 'none');
  const quietAffordance = await matthias.evaluate((node) => ({
    content: getComputedStyle(node, '::after').content,
    opacity: getComputedStyle(node, '::after').opacity,
  }));
  expect(quietAffordance.content).toContain('Matthias');
  expect(quietAffordance.opacity).toBe('0');
  await matthias.hover();
  await expect.poll(() => matthias.evaluate((node) => getComputedStyle(node, '::after').opacity)).toBe('1');

  await matthias.click();
  await expect(page.getByRole('heading', { name: 'Así juegas', exact: true })).toBeVisible();
});

test('Home canónica · el expediente raro de Matthias exige derrotas reales y ocupa su escritorio', async ({ page }) => {
  await page.addInitScript(() => {
    Date.prototype.getFullYear = () => 2026;
    Date.prototype.getMonth = () => 8;
    Date.prototype.getDate = () => 9;
    Date.prototype.getHours = () => 15;
  });

  const rivalry = {
    version: 3,
    totalGames: 3,
    record: { games: 3, wins: 0, draws: 0, losses: 3 },
    incidents: {},
  };
  const home = await openCanonicalHome(page, {
    profileSeed: { 'chess-study-cpu-rivalry': JSON.stringify(rivalry) },
  });
  const matthias = home.locator('.illustrated-home__matthias');
  const { avatar, canvas } = matthiasRig(matthias);

  await expect(matthias).toBeVisible();
  await expect(matthias).toHaveAttribute('data-home-matthias-moment', 'loss-dossier');
  await expect(matthias).toHaveAttribute('data-home-matthias-scene', 'moment-loss-dossier');
  await expect(matthias).toHaveAttribute('data-home-matthias-zone', 'desk');
  await expect(matthias).toHaveAttribute('data-home-matthias-activity', 'Revisando viejas heridas');
  await expect(matthias).toHaveAttribute('data-home-matthias-dwell-ms', '44000');
  await expect(avatar).toHaveAttribute('data-home-matthias-profile', 'dossier');
  await expectBlenderRigReady(avatar, canvas);
});

test('Home canónica · Matthias puede quedarse dormido sobre el manual en la biblioteca', async ({ page }) => {
  await page.addInitScript(() => {
    Date.prototype.getFullYear = () => 2026;
    Date.prototype.getMonth = () => 8;
    Date.prototype.getDate = () => 28;
    Date.prototype.getHours = () => 15;
  });

  const home = await openCanonicalHome(page);
  const matthias = home.locator('.illustrated-home__matthias');
  const { avatar, canvas } = matthiasRig(matthias);

  await expect(matthias).toBeVisible();
  await expect(matthias).toHaveAttribute('data-home-matthias-moment', 'book-doze-sleep');
  await expect(matthias).toHaveAttribute('data-home-matthias-scene', 'moment-book-doze-sleep');
  await expect(matthias).toHaveAttribute('data-home-matthias-zone', 'library');
  await expect(matthias).toHaveAttribute('data-home-matthias-activity', 'Dormido sobre el manual');
  await expect(matthias).toHaveAttribute('data-home-matthias-dwell-ms', '64000');
  await expect(avatar).toHaveAttribute('data-home-matthias-profile', 'sleep');
  await expectBlenderRigReady(avatar, canvas);
});

test('Home canónica · Matthias ensaya una emboscada solo en el escritorio', async ({ page }) => {
  await page.addInitScript(() => {
    Date.prototype.getFullYear = () => 2026;
    Date.prototype.getMonth = () => 8;
    Date.prototype.getDate = () => 3;
    Date.prototype.getHours = () => 15;
  });

  const home = await openCanonicalHome(page);
  const matthias = home.locator('.illustrated-home__matthias');
  const { avatar, canvas } = matthiasRig(matthias);

  await expect(matthias).toBeVisible();
  await expect(matthias).toHaveAttribute('data-home-matthias-moment', 'solo-board-inception');
  await expect(matthias).toHaveAttribute('data-home-matthias-scene', 'moment-solo-board-inception');
  await expect(matthias).toHaveAttribute('data-home-matthias-zone', 'desk');
  await expect(matthias).toHaveAttribute('data-home-matthias-activity', 'Ensayando una emboscada');
  await expect(matthias).toHaveAttribute('data-home-matthias-dwell-ms', '42000');
  await expect(avatar).toHaveAttribute('data-home-matthias-profile', 'think');
  await expectBlenderRigReady(avatar, canvas);
});

test('Home canónica · conserva el render aprobado si el GLB de Matthias no puede cargar', async ({ page }) => {
  await page.route('**/models/matthias-home-canonical.glb', (route) => route.abort());
  const home = await openCanonicalHome(page);
  const matthias = home.locator('.illustrated-home__matthias');
  const { avatar, image, canvas } = matthiasRig(matthias);

  await expect(avatar).toHaveAttribute('data-home-matthias-model-state', 'fallback', { timeout: 15_000 });
  await expect(avatar).toHaveAttribute('data-matthias-render-source', 'bundled-scene-art-fallback');
  await expect(image).toBeVisible();
  await expect(image).toHaveCSS('opacity', '1');
  await expect(canvas).toHaveCSS('opacity', '0');
});

test('Home canónica · arte y destinos comparten el master 1814×867 sin overflow', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const home = await openCanonicalHome(page);
  const stage = home.locator('.illustrated-home__stage');
  const art = home.locator('.illustrated-home__art');

  const destinations = [
    ['tournament', 'TORNEOS'],
    ['train', 'ENTRENAR'],
    ['combat', 'COMBAT CHESS'],
    ['daily', 'DESAFÍO DIARIO'],
    ['history', 'HISTORIA'],
    ['play', /^(JUGAR|CONTINUAR)$/],
  ];
  for (const [id, label] of destinations) {
    const destination = home.locator(`.illustrated-home__destination--${id}`);
    await expect(destination).toBeVisible();
    await expect(destination.locator('strong')).toHaveText(label);
    expect(await destination.evaluate((node) => node.tagName)).toBe('BUTTON');
  }
  await expect(home.locator('.illustrated-home__brand')).toHaveCount(0);
  await expect(home.locator('.illustrated-home__motto')).toHaveCount(0);

  const geometry = await stage.evaluate((node) => {
    const rect = node.getBoundingClientRect();
    return { width: rect.width, height: rect.height, ratio: rect.width / rect.height };
  });
  expect(geometry.ratio).toBeGreaterThan(2.08);
  expect(geometry.ratio).toBeLessThan(2.10);

  const [stageBox, artBox] = await Promise.all([stage.boundingBox(), art.boundingBox()]);
  expect(stageBox).not.toBeNull();
  expect(artBox).not.toBeNull();
  expect(Math.abs(stageBox.width - artBox.width)).toBeLessThanOrEqual(1);
  expect(Math.abs(stageBox.height - artBox.height)).toBeLessThanOrEqual(1);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
});

test('Home canónica · móvil usa la escena a pantalla completa sin cementerio negro inferior', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const home = await openCanonicalHome(page);
  const stage = home.locator('.illustrated-home__stage');
  const art = home.locator('.illustrated-home__art');

  const [homeBox, stageBox, artBox] = await Promise.all([home.boundingBox(), stage.boundingBox(), art.boundingBox()]);
  expect(homeBox).not.toBeNull();
  expect(stageBox).not.toBeNull();
  expect(artBox).not.toBeNull();
  expect(homeBox.height).toBeGreaterThanOrEqual(842);
  expect(stageBox.height).toBeGreaterThanOrEqual(842);
  expect(artBox.height).toBeGreaterThanOrEqual(842);
  expect(Math.abs(stageBox.height - artBox.height)).toBeLessThanOrEqual(1);

  for (const selector of [
    '.illustrated-home__destination--tournament',
    '.illustrated-home__destination--train',
    '.illustrated-home__destination--combat',
    '.illustrated-home__destination--daily',
    '.illustrated-home__destination--history',
    '.illustrated-home__destination--play',
    '.illustrated-home__matthias',
  ]) {
    const box = await home.locator(selector).boundingBox();
    expect(box).not.toBeNull();
    expect(box.y).toBeGreaterThanOrEqual(-1);
    expect(box.y + box.height).toBeLessThanOrEqual(845);
  }

  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
});

test('Home canónica · ultrapanorámica llena el viewport y mantiene la UI clave dentro de zona segura', async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 900 });
  const home = await openCanonicalHome(page);
  const stage = home.locator('.illustrated-home__stage');
  const art = home.locator('.illustrated-home__art');

  const [homeBox, stageBox, artBox] = await Promise.all([home.boundingBox(), stage.boundingBox(), art.boundingBox()]);
  expect(homeBox).not.toBeNull();
  expect(stageBox).not.toBeNull();
  expect(artBox).not.toBeNull();
  expect(Math.abs(homeBox.width - 1920)).toBeLessThanOrEqual(2);
  expect(Math.abs(homeBox.height - 900)).toBeLessThanOrEqual(1);
  expect(Math.abs(stageBox.width - 1920)).toBeLessThanOrEqual(1);
  expect(stageBox.height).toBeGreaterThan(900);
  expect(stageBox.width / stageBox.height).toBeGreaterThan(2.08);
  expect(stageBox.width / stageBox.height).toBeLessThan(2.10);
  expect(Math.abs(stageBox.width - artBox.width)).toBeLessThanOrEqual(1);
  expect(Math.abs(stageBox.height - artBox.height)).toBeLessThanOrEqual(1);

  const matthiasBox = await home.locator('.illustrated-home__matthias').boundingBox();
  expect(matthiasBox).not.toBeNull();
  expect(matthiasBox.y).toBeGreaterThanOrEqual(-1);
  expect(matthiasBox.y + matthiasBox.height).toBeLessThanOrEqual(901);
  await expect(home.locator('.illustrated-home__brand')).toHaveCount(0);
  await expect(home.locator('.illustrated-home__motto')).toHaveCount(0);

  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
});

test('Home canónica · reduced motion congela el rig y elimina transiciones decorativas', async ({ page }) => {
  const home = await openCanonicalHome(page, { reducedMotion: 'reduce' });
  const destination = home.locator('.illustrated-home__destination--tournament');
  const matthias = home.locator('.illustrated-home__matthias');
  const { avatar, image, canvas } = matthiasRig(matthias);

  await expect(destination).toBeVisible();
  await expect(avatar).toHaveAttribute('data-home-matthias-3d', 'ready');
  await expect(avatar).toHaveAttribute('data-motion', 'still-rigged-model');
  await expectBlenderRigReady(avatar, canvas);
  expect(await image.evaluate((node) => getComputedStyle(node).animationName)).toBe('none');
  expect(await canvas.evaluate((node) => Number.parseFloat(getComputedStyle(node).transitionDuration) || 0)).toBeLessThanOrEqual(0.001);

  const transitionSeconds = await destination.evaluate((node) => Number.parseFloat(getComputedStyle(node).transitionDuration) || 0);
  expect(transitionSeconds).toBeLessThanOrEqual(0.001);
});

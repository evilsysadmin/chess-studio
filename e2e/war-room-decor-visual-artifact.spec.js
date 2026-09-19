import { chromium, expect, test } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { buttonWithVisibleText, gameStatus, login, mockApi } from './helpers.js';

const ARTIFACT_DIR = '../.artifacts/app-visual';
const SEEN_WAR_ROOM_TUTORIAL_PROFILE = Object.freeze({
  'chess-study-mechanic-tutorial-progress-v1': JSON.stringify({
    'war-room-basics': { seen: true },
  }),
});
const PROFILES = Object.freeze([
  Object.freeze({
    label: 'desktop-inspection-1600x1000',
    viewport: Object.freeze({ width: 1600, height: 1000 }),
    hasTouch: false,
    deviceScaleFactor: 1,
  }),
  Object.freeze({
    label: 'android-landscape-844x390',
    viewport: Object.freeze({ width: 844, height: 390 }),
    hasTouch: true,
    deviceScaleFactor: 1,
  }),
]);

async function open3DFromAppearance(page) {
  const board3d = page.locator('[data-board3d-war-room="true"]');
  if (await board3d.isVisible().catch(() => false)) return board3d;

  await board3d.waitFor({ state: 'visible', timeout: 3_000 }).catch(() => {});
  if (await board3d.isVisible().catch(() => false)) return board3d;

  await page.getByRole('button', { name: 'Cambiar apariencia y piezas del tablero', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Ajustes' });
  await expect(dialog).toBeVisible();
  await dialog.getByRole('radio', { name: /3D$/ }).click();
  await dialog.getByRole('button', { name: 'Cerrar', exact: true }).click();
  await expect(board3d).toBeVisible({ timeout: 30_000 });
  return board3d;
}

async function openCanonicalWarRoom(page) {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await mockApi(page, {
    profileSeed: {
      ...SEEN_WAR_ROOM_TUTORIAL_PROFILE,
      'matthias.onboarded': '2',
      'chess-study-home-guide-dismissed-v1': '1',
    },
  });
  await login(page);
  await buttonWithVisibleText(page, 'Partida rápida').click();
  const quickMatch = page.getByRole('dialog', { name: 'Configurar partida rápida' });
  await expect(quickMatch).toBeVisible();
  await quickMatch.getByRole('button', { name: 'Empezar partida', exact: true }).click();
  await expect(gameStatus(page)).toBeVisible({ timeout: 60_000 });
  await open3DFromAppearance(page);

  const canvas = page.locator('.board3d-main-canvas');
  await expect(canvas).toBeVisible({ timeout: 30_000 });
  await expect(page.locator('[data-board3d-war-room="true"]')).toHaveAttribute('data-board3d-camera', 'fixed-tactical', { timeout: 30_000 });
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  await page.waitForTimeout(500);
  await expect(page.locator('[data-war-room-first-run-tutorial="true"]')).toHaveCount(0);
  return canvas;
}

async function freezeVisualFrame(page) {
  await page.addStyleTag({
    content: '*, *::before, *::after { animation: none !important; transition: none !important; caret-color: transparent !important; }',
  });
  await page.evaluate(() => {
    window.requestAnimationFrame = () => 0;
  });
  await page.waitForTimeout(80);
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function clipFromRatio(scene, viewport, { x, y, width, height, scale = 1 }) {
  const left = clamp(scene.x + scene.width * x, 0, viewport.width - 1);
  const top = clamp(scene.y + scene.height * y, 0, viewport.height - 1);
  const right = clamp(scene.x + scene.width * (x + width), left + 1, viewport.width);
  const bottom = clamp(scene.y + scene.height * (y + height), top + 1, viewport.height);
  return {
    x: Number(left.toFixed(2)),
    y: Number(top.toFixed(2)),
    width: Number((right - left).toFixed(2)),
    height: Number((bottom - top).toFixed(2)),
    scale,
  };
}

async function captureSceneOnce(context, page, clip) {
  const session = await context.newCDPSession(page);
  try {
    const { data } = await session.send('Page.captureScreenshot', {
      format: 'png',
      fromSurface: true,
      captureBeyondViewport: false,
      clip: { ...clip, scale: 1 },
    });
    return data;
  } finally {
    await session.detach();
  }
}

async function deriveCropsFromScene(page, scenePng, sourceClip, captures) {
  return page.evaluate(async ({ png, source, items }) => {
    const image = new Image();
    image.src = `data:image/png;base64,${png}`;
    await image.decode();

    const sourceScaleX = image.naturalWidth / source.width;
    const sourceScaleY = image.naturalHeight / source.height;
    const outputs = [];

    for (const item of items) {
      const outputScale = Number.isFinite(item.clip.scale) ? item.clip.scale : 1;
      const outputWidth = Math.max(1, Math.round(item.clip.width * outputScale));
      const outputHeight = Math.max(1, Math.round(item.clip.height * outputScale));
      const canvas = document.createElement('canvas');
      canvas.width = outputWidth;
      canvas.height = outputHeight;
      const context2d = canvas.getContext('2d');
      if (!context2d) throw new Error(`2D canvas unavailable while deriving ${item.name}`);
      context2d.imageSmoothingEnabled = true;
      context2d.imageSmoothingQuality = 'high';

      const sourceX = Math.max(0, (item.clip.x - source.x) * sourceScaleX);
      const sourceY = Math.max(0, (item.clip.y - source.y) * sourceScaleY);
      const sourceWidth = Math.min(image.naturalWidth - sourceX, item.clip.width * sourceScaleX);
      const sourceHeight = Math.min(image.naturalHeight - sourceY, item.clip.height * sourceScaleY);
      context2d.drawImage(
        image,
        sourceX,
        sourceY,
        sourceWidth,
        sourceHeight,
        0,
        0,
        outputWidth,
        outputHeight,
      );
      outputs.push({
        name: item.name,
        data: canvas.toDataURL('image/png').replace(/^data:image\/png;base64,/, ''),
      });
    }

    return outputs;
  }, { png: scenePng, source: sourceClip, items: captures });
}

for (const profile of PROFILES) {
  test(`War Room decor · scene-first captures ${profile.label}`, async () => {
    // SwiftShader was spending minutes re-rasterizing the same frozen WebGL
    // frame once per crop. Capture the scene once, then derive review crops on a
    // cheap 2D canvas. The visual evidence stays coherent and deterministic.
    test.setTimeout(profile.hasTouch ? 120_000 : 180_000);
    await mkdir(ARTIFACT_DIR, { recursive: true });

    const browser = await chromium.launch({
      headless: true,
      args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
    });
    const context = await browser.newContext({
      viewport: profile.viewport,
      hasTouch: profile.hasTouch,
      deviceScaleFactor: profile.deviceScaleFactor,
    });
    await context.addInitScript(() => {
      Object.defineProperty(navigator, 'hardwareConcurrency', { configurable: true, get: () => 8 });
    });

    const page = await context.newPage();
    try {
      const canvas = await openCanonicalWarRoom(page);
      const scene = await canvas.boundingBox();
      expect(scene?.width, 'War Room canvas must have width').toBeGreaterThan(100);
      expect(scene?.height, 'War Room canvas must have height').toBeGreaterThan(100);

      await freezeVisualFrame(page);

      const baseCaptures = [
        { name: 'scene', ratio: { x: 0, y: 0, width: 1, height: 1 } },
        { name: 'decor-left', ratio: { x: 0, y: 0, width: 0.34, height: 1 } },
        { name: 'decor-right', ratio: { x: 0.66, y: 0, width: 0.34, height: 1 } },
        { name: 'decor-upper', ratio: { x: 0, y: 0, width: 1, height: 0.52 } },
      ];
      const desktopDetailCaptures = profile.hasTouch ? [] : [
        { name: 'armor-left-detail', ratio: { x: 0.075, y: 0.27, width: 0.12, height: 0.22, scale: 2 } },
        { name: 'armor-right-detail', ratio: { x: 0.81, y: 0.27, width: 0.12, height: 0.22, scale: 2 } },
        { name: 'gallery-left-detail', ratio: { x: 0.14, y: 0.035, width: 0.27, height: 0.31, scale: 2 } },
        { name: 'gallery-right-detail', ratio: { x: 0.59, y: 0.035, width: 0.27, height: 0.31, scale: 2 } },
      ];
      const captures = [...baseCaptures, ...desktopDetailCaptures].map((capture) => ({
        ...capture,
        clip: clipFromRatio(scene, profile.viewport, capture.ratio),
      }));

      const sceneCapture = captures.find(({ name }) => name === 'scene');
      if (!sceneCapture) throw new Error('War Room scene capture definition missing');
      const scenePng = await captureSceneOnce(context, page, sceneCapture.clip);
      await writeFile(
        `${ARTIFACT_DIR}/war-room-${profile.label}-scene.png`,
        Buffer.from(scenePng, 'base64'),
      );

      const cropCaptures = captures.filter(({ name }) => name !== 'scene');
      const derived = await deriveCropsFromScene(page, scenePng, sceneCapture.clip, cropCaptures);
      for (const capture of derived) {
        await writeFile(
          `${ARTIFACT_DIR}/war-room-${profile.label}-${capture.name}.png`,
          Buffer.from(capture.data, 'base64'),
        );
      }

      await writeFile(
        `${ARTIFACT_DIR}/war-room-${profile.label}-decor-manifest.json`,
        `${JSON.stringify({
          schema: 2,
          purpose: 'scene-first War Room decor review',
          captureStrategy: 'single-webgl-frame-derived-crops',
          profile,
          scene: {
            x: Number(scene.x.toFixed(2)),
            y: Number(scene.y.toFixed(2)),
            width: Number(scene.width.toFixed(2)),
            height: Number(scene.height.toFixed(2)),
          },
          captures: captures.map(({ name, ratio, clip }) => ({ name, ratio, clip })),
        }, null, 2)}\n`,
        'utf8',
      );
    } finally {
      await context.close();
      await browser.close();
    }
  });
}

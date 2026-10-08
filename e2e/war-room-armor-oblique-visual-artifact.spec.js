import { chromium, expect, test } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { activateSetupControl, buttonWithVisibleText, gameStatus, login, mockApi } from './helpers.js';

const ARTIFACT_DIR = '../.artifacts/app-visual';
const SEEN_WAR_ROOM_TUTORIAL_PROFILE = Object.freeze({
  'chess-study-mechanic-tutorial-progress-v1': JSON.stringify({
    'war-room-basics': { seen: true },
  }),
});
const VIEWPORT = Object.freeze({ width: 1600, height: 1000 });

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
  await activateSetupControl(quickMatch.getByRole('button', { name: 'Empezar partida', exact: true }));
  await expect(gameStatus(page)).toBeVisible({ timeout: 60_000 });
  const board3d = await open3DFromAppearance(page);
  const canvas = page.locator('.board3d-main-canvas');
  await expect(canvas).toBeVisible({ timeout: 30_000 });
  await expect(board3d).toHaveAttribute('data-board3d-camera', 'fixed-tactical', { timeout: 30_000 });
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  await page.waitForTimeout(400);
  await expect(page.locator('[data-war-room-first-run-tutorial="true"]')).toHaveCount(0);
  return { board3d, canvas };
}

async function captureCanvas(context, page, scene) {
  const session = await context.newCDPSession(page);
  try {
    const { data } = await session.send('Page.captureScreenshot', {
      format: 'png',
      fromSurface: true,
      captureBeyondViewport: false,
      clip: { ...scene, scale: 1 },
    });
    return data;
  } finally {
    await session.detach();
  }
}

async function cropArmorPair(context, scenePng) {
  const cropPage = await context.newPage();
  try {
    return await cropPage.evaluate(async (png) => {
      const image = new Image();
      const loaded = new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('armor crop image decode timed out')), 10_000);
        image.onload = () => { clearTimeout(timer); resolve(); };
        image.onerror = () => { clearTimeout(timer); reject(new Error('armor crop image decode failed')); };
      });
      image.src = `data:image/png;base64,${png}`;
      await loaded;

      const crop = (ratio) => {
        const sx = Math.round(image.naturalWidth * ratio.x);
        const sy = Math.round(image.naturalHeight * ratio.y);
        const sw = Math.round(image.naturalWidth * ratio.width);
        const sh = Math.round(image.naturalHeight * ratio.height);
        const output = document.createElement('canvas');
        output.width = sw * 3;
        output.height = sh * 3;
        const ctx = output.getContext('2d');
        if (!ctx) throw new Error('2D canvas unavailable for armor crop');
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(image, sx, sy, sw, sh, 0, 0, output.width, output.height);
        return output.toDataURL('image/png').replace(/^data:image\/png;base64,/, '');
      };

      return {
        left: crop({ x: 0.015, y: 0.18, width: 0.27, height: 0.44 }),
        right: crop({ x: 0.715, y: 0.18, width: 0.27, height: 0.44 }),
      };
    }, scenePng);
  } finally {
    await cropPage.close().catch(() => {});
  }
}

test('War Room armor · artifacts expose sword grip on both armors from the player camera', async () => {
  test.setTimeout(150_000);
  await mkdir(ARTIFACT_DIR, { recursive: true });

  const browser = await chromium.launch({
    headless: true,
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
  });
  const context = await browser.newContext({
    viewport: VIEWPORT,
    hasTouch: false,
    deviceScaleFactor: 1,
  });
  await context.addInitScript(() => {
    Object.defineProperty(navigator, 'hardwareConcurrency', { configurable: true, get: () => 8 });
  });

  const page = await context.newPage();
  try {
    const { board3d, canvas } = await openCanonicalWarRoom(page);
    const scene = await canvas.boundingBox();
    expect(scene?.width, 'War Room canvas must have width').toBeGreaterThan(100);
    expect(scene?.height, 'War Room canvas must have height').toBeGreaterThan(100);

    await page.addStyleTag({
      content: '*, *::before, *::after { animation: none !important; transition: none !important; caret-color: transparent !important; }',
    });
    // The camera is fixed (scene inspection was retired), so the armor and
    // sword grip are reviewed exactly as players see them.
    await expect(board3d).toHaveAttribute('data-board3d-camera', 'fixed-tactical');
    await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    await page.waitForTimeout(160);
    for (const capture of [{ label: 'canonical' }]) {
      const png = await captureCanvas(context, page, scene);
      await writeFile(
        `${ARTIFACT_DIR}/war-room-desktop-inspection-1600x1000-${capture.label}-scene.png`,
        Buffer.from(png, 'base64'),
      );
      const crops = await cropArmorPair(context, png);
      for (const side of ['left', 'right']) {
        await writeFile(
          `${ARTIFACT_DIR}/war-room-desktop-inspection-1600x1000-${capture.label}-armor-${side}.png`,
          Buffer.from(crops[side], 'base64'),
        );
      }
    }

    await writeFile(
      `${ARTIFACT_DIR}/war-room-desktop-inspection-1600x1000-armor-oblique-manifest.json`,
      `${JSON.stringify({
        schema: 1,
        purpose: 'user-reachable armor and sword-grip review (fixed tactical camera)',
        source: 'Board3D fixed tactical camera',
        crops: ['armor-left', 'armor-right'],
      }, null, 2)}\n`,
      'utf8',
    );
  } finally {
    await context.close();
    await browser.close();
  }
});

import { chromium, expect, test } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { buttonWithVisibleText, gameStatus, login, mockApi } from './helpers.js';

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
  await quickMatch.getByRole('button', { name: 'Empezar partida', exact: true }).click();
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

async function cropArmor(page, scenePng, side) {
  return page.evaluate(async ({ png, cropSide }) => {
    const image = new Image();
    image.src = `data:image/png;base64,${png}`;
    await image.decode();

    const ratio = cropSide === 'left'
      ? { x: 0.015, y: 0.18, width: 0.27, height: 0.44 }
      : { x: 0.715, y: 0.18, width: 0.27, height: 0.44 };
    const sx = Math.round(image.naturalWidth * ratio.x);
    const sy = Math.round(image.naturalHeight * ratio.y);
    const sw = Math.round(image.naturalWidth * ratio.width);
    const sh = Math.round(image.naturalHeight * ratio.height);
    const output = document.createElement('canvas');
    output.width = sw * 3;
    output.height = sh * 3;
    const ctx = output.getContext('2d');
    if (!ctx) throw new Error('2D canvas unavailable for armor oblique crop');
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(image, sx, sy, sw, sh, 0, 0, output.width, output.height);
    return output.toDataURL('image/png').replace(/^data:image\/png;base64,/, '');
  }, { png: scenePng, cropSide: side });
}

async function setInspectYaw(page, canvas, key, expectedYaw) {
  await canvas.focus();
  await page.keyboard.press('Home');
  for (let i = 0; i < 6; i += 1) await page.keyboard.press(key);
  await expect(canvas).toHaveAttribute('data-board3d-inspect-yaw', expectedYaw);
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  await page.waitForTimeout(160);
}

test('War Room armor · oblique inspection artifacts expose sword grip from both sides', async () => {
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
    await page.getByRole('button', { name: 'Inspeccionar', exact: true }).click();
    await expect(board3d).toHaveAttribute('data-board3d-inspect', 'true');

    const captures = [
      { label: 'yaw-left', key: 'ArrowLeft', yaw: '0.140' },
      { label: 'yaw-right', key: 'ArrowRight', yaw: '-0.140' },
    ];

    for (const capture of captures) {
      await setInspectYaw(page, canvas, capture.key, capture.yaw);
      const png = await captureCanvas(context, page, scene);
      await writeFile(
        `${ARTIFACT_DIR}/war-room-desktop-inspection-1600x1000-${capture.label}-scene.png`,
        Buffer.from(png, 'base64'),
      );
      for (const side of ['left', 'right']) {
        const crop = await cropArmor(page, png, side);
        await writeFile(
          `${ARTIFACT_DIR}/war-room-desktop-inspection-1600x1000-${capture.label}-armor-${side}.png`,
          Buffer.from(crop, 'base64'),
        );
      }
    }

    await writeFile(
      `${ARTIFACT_DIR}/war-room-desktop-inspection-1600x1000-armor-oblique-manifest.json`,
      `${JSON.stringify({
        schema: 1,
        purpose: 'user-reachable oblique armor and sword-grip review',
        inspectYawRadians: [-0.14, 0.14],
        source: 'Board3D Inspeccionar keyboard limits',
        crops: ['armor-left', 'armor-right'],
      }, null, 2)}\n`,
      'utf8',
    );
  } finally {
    await context.close();
    await browser.close();
  }
});

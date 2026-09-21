import { chromium, expect, test } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { login, mockApi } from './helpers.js';

const ARTIFACT_DIR = '../.artifacts/app-visual';
const LOCAL_GPU_CAPTURE = process.env.HOME_MATTHIAS_LOCAL_GPU === '1';
const CAPTURE_BASE_URL = process.env.HOME_MATTHIAS_BASE_URL;
const FIXED_LOCAL_TIME = { year:2026, monthIndex:8, day:14, hour:20, minute:0, second:0 };
const CAPTURES = [
  { label:'desktop-1440x900', width:1440, height:900, expectCopy:false },
  { label:'android-390x844', width:390, height:844, hasTouch:true, expectCopy:false },
];

async function freezeClockAtCampaignDinner(context) {
  await context.addInitScript((fixed) => {
    const OriginalDate = Date;
    const timestamp = new OriginalDate(
      fixed.year,
      fixed.monthIndex,
      fixed.day,
      fixed.hour,
      fixed.minute,
      fixed.second,
      0,
    ).getTime();

    class FixedDate extends OriginalDate {
      constructor(...args) {
        super(...(args.length ? args : [timestamp]));
      }

      static now() {
        return timestamp;
      }
    }

    Object.setPrototypeOf(FixedDate, OriginalDate);
    globalThis.Date = FixedDate;
  }, FIXED_LOCAL_TIME);
}

async function openDeterministicHome(page) {
  await page.emulateMedia({ reducedMotion:'no-preference' });
  await mockApi(page, {
    profileSeed: {
      'matthias.onboarded': '2',
      'chess-study-home-guide-dismissed-v1': '1',
    },
  });
  await login(page);

  const home = page.getByRole('region', { name:'Modos principales' });
  await expect(home).toBeVisible();
  await expect(home.locator('.illustrated-home__stage')).toBeVisible();
  // The castle renderer may deliberately stay on its canonical 2D fallback on
  // constrained/touch viewports. Matthias owns an independent WebGL contract,
  // so his canary waits for his Blender model below instead of another surface.
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  await page.waitForTimeout(250);
  return home;
}

async function expectLiveMatthiasArt(home) {
  const avatar = home.locator('[data-home-matthias-3d="ready"]');
  const image = avatar.locator('img[data-matthias-fallback="canonical-scene-render"]');
  const canvas = avatar.locator('canvas[data-matthias-canonical-model="blender"]');
  await expect(avatar).toHaveCount(1, { timeout:15_000 });
  await expect(avatar).toHaveAttribute('data-home-matthias-3d', 'ready', { timeout:15_000 });
  await expect(avatar).toHaveAttribute('data-home-matthias-model-state', 'ready', { timeout:15_000 });
  await expect(avatar).toHaveAttribute('data-matthias-identity', 'canonical-blender-rig', { timeout:15_000 });
  await expect(avatar).toHaveAttribute('data-matthias-render-source', 'blender-glb', { timeout:15_000 });
  await expect(image).toHaveCount(1);
  await expect(image).toHaveCSS('opacity', '0');
  await expect(canvas).toHaveCount(1);
  await expect(canvas).toBeVisible({ timeout:15_000 });
  await expect(canvas).toHaveCSS('opacity', '1');
  await expect(canvas).toHaveAttribute('data-matthias-camera-facing', 'visible-front-geometry');
  await expect(canvas).toHaveAttribute('data-matthias-camera-contract', 'visible-front-geometry');
  await expect(canvas).toHaveAttribute('data-matthias-camera-face-x', '0.0000');
  await expect(canvas).toHaveAttribute('data-matthias-camera-face-z', '1.0000');
  await expect(canvas).toHaveAttribute('data-matthias-front-geometry-count', '10');
  return { avatar, image, canvas };
}

async function freezeForScreenshot(page) {
  await page.addStyleTag({
    content:`
      *, *::before, *::after {
        animation: none !important;
        transition: none !important;
        caret-color: transparent !important;
      }
      .illustrated-home__speech,
      .ambient-player,
      .toast,
      [role='alert'] {
        display: none !important;
      }
    `,
  });
  await page.waitForTimeout(80);
}

async function captureViewportPng(context, page, path) {
  const session = await context.newCDPSession(page);
  try {
    const { data } = await session.send('Page.captureScreenshot', {
      format:'png',
      fromSurface:true,
      captureBeyondViewport:false,
    });
    await writeFile(path, Buffer.from(data, 'base64'));
  } finally {
    await session.detach();
  }
}

async function captureElementPng(context, page, locator, path) {
  const box = await locator.boundingBox();
  expect(box).not.toBeNull();
  const session = await context.newCDPSession(page);
  try {
    const { data } = await session.send('Page.captureScreenshot', {
      format:'png',
      fromSurface:true,
      captureBeyondViewport:false,
      clip:{ x:box.x, y:box.y, width:box.width, height:box.height, scale:1 },
    });
    await writeFile(path, Buffer.from(data, 'base64'));
  } finally {
    await session.detach();
  }
}

test('App visual artifact · Matthias Home deterministic full + crop', async () => {
  test.setTimeout(100_000);
  await mkdir(ARTIFACT_DIR, { recursive:true });

  const visualBrowser = await chromium.launch({
    headless:true,
    args:LOCAL_GPU_CAPTURE
      ? ['--use-angle=gl', '--use-gl=angle', '--ignore-gpu-blocklist', '--enable-gpu-rasterization']
      : [],
    env:LOCAL_GPU_CAPTURE
      ? { ...process.env, __NV_PRIME_RENDER_OFFLOAD:'1', __GLX_VENDOR_LIBRARY_NAME:'nvidia' }
      : process.env,
  });

  try {
    for (const capture of CAPTURES) {
      const context = await visualBrowser.newContext({
        viewport:{ width:capture.width, height:capture.height },
        hasTouch:capture.hasTouch === true,
        ...(CAPTURE_BASE_URL ? { baseURL:CAPTURE_BASE_URL } : {}),
      });
      await freezeClockAtCampaignDinner(context);
      const page = await context.newPage();

      try {
        const home = await openDeterministicHome(page);
        const speech = page.getByRole('region', { name:'Mensaje de Matthias', exact:true });
        if (await speech.isVisible().catch(() => false)) {
          await speech.getByRole('button', { name:'Cerrar comentario de Matthias', exact:true }).evaluate((button) => button.click());
        }
        const renderer = await page.evaluate(() => {
          const gl = document.createElement('canvas').getContext('webgl2');
          const debug = gl?.getExtension('WEBGL_debug_renderer_info');
          return debug ? gl.getParameter(debug.UNMASKED_RENDERER_WEBGL) : 'unavailable';
        });
        if (LOCAL_GPU_CAPTURE) {
          expect(renderer).toMatch(/NVIDIA/i);
          expect(renderer).not.toMatch(/SwiftShader/i);
        }
        await writeFile(
          `${ARTIFACT_DIR}/home-matthias-${capture.label}-renderer.json`,
          `${JSON.stringify({ renderer, localGpuRequired:LOCAL_GPU_CAPTURE }, null, 2)}\n`,
        );
        const matthias = home.locator('.illustrated-home__matthias');
        const copy = matthias.locator('.illustrated-home__matthias-copy');

        await expect(matthias).toBeVisible();
        const { avatar, image, canvas } = await expectLiveMatthiasArt(home);
        await expect(avatar).toBeVisible({ timeout:15_000 });
        await expect(avatar).toHaveAttribute('data-motion', 'rigged-gltf-clips');
        await expect(avatar).toHaveAttribute('data-home-matthias-profile', 'bite', { timeout:15_000 });
        await expect(image).toHaveAttribute('src', /lunch-bocata/i);
        await expect(canvas).toHaveAttribute('data-matthias-canonical-model', 'blender');
        await expect(avatar.locator('[data-matthias-layered-art="true"]')).toHaveCount(0);

        if (capture.expectCopy) {
          await expect(copy).toBeVisible();
          await expect(copy.locator('strong')).toHaveText('MATTHIAS');
          await expect(copy.locator('span')).toHaveText('Cena de campaña');
        } else {
          await expect(copy).toBeHidden();
        }

        await freezeForScreenshot(page);
        await captureViewportPng(
          context,
          page,
          `${ARTIFACT_DIR}/home-matthias-${capture.label}-full.png`,
        );
        await captureElementPng(
          context,
          page,
          matthias,
          `${ARTIFACT_DIR}/home-matthias-${capture.label}-crop.png`,
        );
      } finally {
        await context.close();
      }
    }
  } finally {
    await visualBrowser.close();
  }
});

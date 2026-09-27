import { chromium, expect, test } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { buttonWithVisibleText, login, mockApi } from './helpers.js';
import { WAR_ROOM_CAT_VERSION } from '../frontend/src/components/WarRoomCatDecor.js';

const ARTIFACT_DIR = '../.artifacts/app-visual';
const SEEN_WAR_ROOM_TUTORIAL_PROFILE = Object.freeze({
  'chess-study-mechanic-tutorial-progress-v1': JSON.stringify({
    'war-room-basics': { seen: true },
  }),
});
const WAR_ROOM_VARIANT_STORAGE_KEY = 'chess-study-war-room-variant-v1';
const WAR_ROOM_V2_REVISION_BASE =
  'https://assets.chess-studio.shadowops.dpdns.org/war-room/v2/staging/revisions';
const WAR_ROOM_V3_REVISION_BASE =
  'https://assets.chess-studio.shadowops.dpdns.org/war-room/v3/staging/revisions';
const LOCAL_GPU_CAPTURE = process.env.APP_VISUAL_LOCAL_GPU === '1';
const WAR_ROOM_PROFILE_SCOPE = String(process.env.APP_VISUAL_WARROOM_PROFILE_SCOPE || 'all').trim().toLowerCase();
const WAR_ROOM_VISUAL_VARIANTS = new Set(
  (process.env.APP_VISUAL_WARROOM_VARIANTS || 'classic,v2,v3')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean),
);

function expectedWarRoomV2Revision() {
  return String(process.env.APP_VISUAL_EXPECTED_WAR_ROOM_REVISION || '').trim();
}

async function installWarRoomV2RevisionRoute(page) {
  const expected = expectedWarRoomV2Revision();
  if (!expected) return;
  const deadline = Date.now() + 180_000;
  const revisionUrl = WAR_ROOM_V2_REVISION_BASE + '/' + encodeURIComponent(expected) + '.glb';
  let body = null;
  while (Date.now() < deadline) {
    try {
      const response = await page.request.get(revisionUrl + '?probe=' + Date.now(), {
        headers: { 'cache-control': 'no-cache' },
        timeout: 10_000,
      });
      if (response.ok()) {
        body = await response.body();
        break;
      }
    } catch {
      // Blender may still be publishing; keep polling to the bounded deadline.
    }
    await new Promise((resolve) => setTimeout(resolve, 1_500));
  }
  if (!body) throw new Error('War Room v2 revision GLB timeout: ' + expected);

  await page.route('**/war-room/v2/runtime/current.glb*', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'model/gltf-binary',
      body,
      headers: { 'cache-control': 'no-store' },
    });
  });
}

function expectedWarRoomV3Revision() {
  return String(process.env.APP_VISUAL_EXPECTED_WAR_ROOM_V3_REVISION || '').trim();
}

async function installWarRoomV3RevisionRoute(page) {
  const expected = expectedWarRoomV3Revision();
  if (!expected) return;
  const deadline = Date.now() + 180_000;
  const revisionUrl = WAR_ROOM_V3_REVISION_BASE + '/' + encodeURIComponent(expected) + '.glb';
  let body = null;
  while (Date.now() < deadline) {
    try {
      const response = await page.request.get(revisionUrl + '?probe=' + Date.now(), {
        headers: { 'cache-control': 'no-cache' },
        timeout: 10_000,
      });
      if (response.ok()) {
        body = await response.body();
        break;
      }
    } catch {
      // Blender may still be publishing; keep polling to the bounded deadline.
    }
    await new Promise((resolve) => setTimeout(resolve, 1_500));
  }
  if (!body) throw new Error('War Room v3 revision GLB timeout: ' + expected);

  await page.route('**/war-room/v3/runtime/current.glb*', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'model/gltf-binary',
      body,
      headers: { 'cache-control': 'no-store' },
    });
  });
}
const CAPTURE_PROFILES = Object.freeze([
  Object.freeze({
    label: 'war-room-android-390x844',
    title: 'Android portrait',
    viewport: Object.freeze({ width: 390, height: 844 }),
    hasTouch: true,
    portraitContract: true,
    landscapeContract: false,
  }),
  Object.freeze({
    label: 'war-room-android-landscape-844x390',
    title: 'Android landscape',
    viewport: Object.freeze({ width: 844, height: 390 }),
    hasTouch: true,
    portraitContract: false,
    landscapeContract: true,
  }),
  Object.freeze({
    label: 'war-room-desktop-1440x900',
    title: 'Desktop 1440×900',
    viewport: Object.freeze({ width: 1440, height: 900 }),
    hasTouch: false,
    portraitContract: false,
    landscapeContract: false,
    variant: 'classic',
  }),
  Object.freeze({
    label: 'war-room-v2-android-390x844',
    title: 'War Room v2 Android portrait',
    viewport: Object.freeze({ width: 390, height: 844 }),
    hasTouch: true,
    portraitContract: true,
    landscapeContract: false,
    variant: 'v2',
  }),
  Object.freeze({
    label: 'war-room-v2-android-landscape-844x390',
    title: 'War Room v2 Android landscape',
    viewport: Object.freeze({ width: 844, height: 390 }),
    hasTouch: true,
    portraitContract: false,
    landscapeContract: true,
    variant: 'v2',
  }),
  Object.freeze({
    label: 'war-room-v2-desktop-1440x900',
    title: 'War Room v2 desktop 1440×900',
    viewport: Object.freeze({ width: 1440, height: 900 }),
    hasTouch: false,
    portraitContract: false,
    landscapeContract: false,
    variant: 'v2',
  }),
  Object.freeze({
    label: 'war-room-v3-android-390x844',
    title: 'War Room v3 Android portrait',
    viewport: Object.freeze({ width: 390, height: 844 }),
    hasTouch: true,
    portraitContract: true,
    landscapeContract: false,
    variant: 'v3',
  }),
  Object.freeze({
    label: 'war-room-v3-android-landscape-844x390',
    title: 'War Room v3 Android landscape',
    viewport: Object.freeze({ width: 844, height: 390 }),
    hasTouch: true,
    portraitContract: false,
    landscapeContract: true,
    variant: 'v3',
  }),
  Object.freeze({
    label: 'war-room-v3-desktop-1440x900',
    title: 'War Room v3 desktop 1440×900',
    viewport: Object.freeze({ width: 1440, height: 900 }),
    hasTouch: false,
    portraitContract: false,
    landscapeContract: false,
    variant: 'v3',
  }),
]);
const ACTIVE_CAPTURE_PROFILES = Object.freeze(
  CAPTURE_PROFILES.filter((profile) => {
    if (!WAR_ROOM_VISUAL_VARIANTS.has(profile.variant || 'classic')) return false;
    if (WAR_ROOM_PROFILE_SCOPE === 'mobile-entry') {
      return new Set([
        'war-room-android-390x844',
        'war-room-android-landscape-844x390',
      ]).has(profile.label);
    }
    if (WAR_ROOM_PROFILE_SCOPE === 'mobile') return profile.hasTouch === true;
    return true;
  }),
);

async function open3DFromAppearance(page) {
  const board3d = page.locator('[data-board3d-war-room="true"]');
  if (await board3d.isVisible().catch(() => false)) return board3d;

  // Quick Match defaults to 3D, but its lazy Three chunk can settle a moment
  // after the game route itself. Give the canonical renderer a short chance to
  // appear before falling back to the Appearance control, which is intentionally
  // hidden once the War Room owns the screen.
  await board3d.waitFor({ state: 'visible', timeout: 3_000 }).catch(() => {});
  if (await board3d.isVisible().catch(() => false)) return board3d;

  await page.getByRole('button', { name: 'Cambiar apariencia y piezas del tablero', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Ajustes' });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('radiogroup', { name: 'Estilo de piezas' })).toBeVisible();
  await dialog.getByRole('radio', { name: /3D$/ }).click();
  await dialog.getByRole('button', { name: 'Cerrar', exact: true }).click();
  await expect(board3d).toBeVisible({ timeout: 30_000 });
  return board3d;
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

async function captureViewportPng(context, page, path) {
  // CDP + headless SwiftShader can omit WebGL compositor layers even when the
  // canvas is visibly rendered. Visual-artifact builds preserve the drawing
  // buffer, so rasterize that canvas into a temporary DOM image and let the
  // viewport screenshot capture scene + HUD together. Keep the raster inside
  // the 3D shell when possible: immersive mode creates a high-z stacking
  // context, so a body-level fallback image would sit behind the room.
  const staged = await page.evaluate(() => {
    const canvases = [...document.querySelectorAll('canvas.board3d-main-canvas')];
    return canvases.map((canvas, index) => {
      const rect = canvas.getBoundingClientRect();
      const shell = canvas.closest('.board3d-main-shell');
      const shellRect = shell?.getBoundingClientRect();
      const image = document.createElement('img');
      image.src = canvas.toDataURL('image/png');
      image.alt = '';
      image.dataset.warRoomWebglCapture = String(index);
      Object.assign(image.style, {
        position: shell ? 'absolute' : 'fixed',
        left: `${shellRect ? rect.left - shellRect.left : rect.left}px`,
        top: `${shellRect ? rect.top - shellRect.top : rect.top}px`,
        width: `${rect.width}px`,
        height: `${rect.height}px`,
        zIndex: '1',
        pointerEvents: 'none',
        objectFit: 'fill',
      });
      (shell || document.body).appendChild(image);
      return image.dataset.warRoomWebglCapture;
    });
  });
  if (staged.length) {
    await page.waitForFunction(
      () => [...document.querySelectorAll('img[data-war-room-webgl-capture]')]
        .every((image) => image.complete && image.naturalWidth > 0),
    );
  }

  const session = await context.newCDPSession(page);
  try {
    const { data } = await session.send('Page.captureScreenshot', {
      format: 'png',
      fromSurface: true,
      captureBeyondViewport: false,
    });
    await writeFile(path, Buffer.from(data, 'base64'));
  } finally {
    await session.detach();
    await page.evaluate(() => {
      document.querySelectorAll('img[data-war-room-webgl-capture]').forEach((image) => image.remove());
    });
  }
}

async function captureWarRoomHealth(page, label) {
  return page.evaluate((captureLabel) => {
    const viewport = { width: window.innerWidth, height: window.innerHeight };
    const box = (selector) => {
      const node = document.querySelector(selector);
      if (!node) return null;
      const rect = node.getBoundingClientRect();
      const style = getComputedStyle(node);
      return {
        width: Number(rect.width.toFixed(1)),
        height: Number(rect.height.toFixed(1)),
        left: Number(rect.left.toFixed(1)),
        right: Number(rect.right.toFixed(1)),
        top: Number(rect.top.toFixed(1)),
        bottom: Number(rect.bottom.toFixed(1)),
        display: style.display,
        visibility: style.visibility,
      };
    };
    const buttonBox = (labelText) => {
      const node = [...document.querySelectorAll('button, [role="button"]')]
        .find((candidate) => {
          if ((candidate.getAttribute('aria-label') || '').trim() !== labelText) return false;
          const rect = candidate.getBoundingClientRect();
          const style = getComputedStyle(candidate);
          return rect.width > 0 && rect.height > 0 && style.display !== 'none' && style.visibility !== 'hidden';
        });
      if (!node) return null;
      const rect = node.getBoundingClientRect();
      return {
        width: Number(rect.width.toFixed(1)),
        height: Number(rect.height.toFixed(1)),
        left: Number(rect.left.toFixed(1)),
        right: Number(rect.right.toFixed(1)),
        top: Number(rect.top.toFixed(1)),
        bottom: Number(rect.bottom.toFixed(1)),
      };
    };
    const overflowOffenders = [...document.body.querySelectorAll('*')]
      .map((node) => {
        const style = getComputedStyle(node);
        const rect = node.getBoundingClientRect();
        if (
          style.display === 'none'
          || style.visibility === 'hidden'
          || rect.width <= 0
          || rect.height <= 0
        ) return null;
        const overflowLeft = Math.max(0, -rect.left);
        const overflowRight = Math.max(0, rect.right - viewport.width);
        const overflowTop = Math.max(0, -rect.top);
        const overflowBottom = Math.max(0, rect.bottom - viewport.height);
        const overflow = Math.max(overflowLeft, overflowRight, overflowTop, overflowBottom);
        if (overflow <= 1) return null;
        const className = typeof node.className === 'string'
          ? node.className
          : (node.getAttribute('class') || '');
        return {
          tag: node.tagName.toLowerCase(),
          id: node.id || null,
          className: className || null,
          ariaLabel: node.getAttribute('aria-label') || null,
          position: style.position,
          overflow: Number(overflow.toFixed(1)),
          left: Number(rect.left.toFixed(1)),
          right: Number(rect.right.toFixed(1)),
          top: Number(rect.top.toFixed(1)),
          bottom: Number(rect.bottom.toFixed(1)),
          width: Number(rect.width.toFixed(1)),
          height: Number(rect.height.toFixed(1)),
        };
      })
      .filter(Boolean)
      .sort((a, b) => b.overflow - a.overflow)
      .slice(0, 18);

    const root = document.documentElement;
    const canvas = document.querySelector('canvas.board3d-main-canvas');
    const board = box('[data-board3d-war-room="true"]');
    const legacyCommandDeck = box('.game-board-stack-3d > .game-command-deck');
    const masthead = box('.masthead-game-compact');
    const appShell = box('.app-shell-board-game');
    const gameScreen = box('.game-screen');
    const gameLayout = box('.game-layout.game-layout-3d');
    const liveRow = box('.board-live-row.is-3d-warroom');
    const sideColumn = box('.game-side-column.game-side-column-3d');
    const overflow = buttonBox('Más acciones de partida');
    const boardVisibleWidth = board
      ? Math.max(0, Math.min(board.right, viewport.width) - Math.max(board.left, 0))
      : 0;
    const boardVisibleHeight = board
      ? Math.max(0, Math.min(board.bottom, viewport.height) - Math.max(board.top, 0))
      : 0;

    return {
      label: captureLabel,
      viewport,
      dpr: window.devicePixelRatio,
      hardwareConcurrency: navigator.hardwareConcurrency,
      touchPoints: navigator.maxTouchPoints,
      coarsePointer: window.matchMedia('(pointer: coarse)').matches,
      renderer: canvas?.dataset.board3dRenderer || null,
      rendererClass: canvas?.dataset.board3dRendererClass || null,
      renderPath: canvas?.dataset.board3dRenderPath || null,
      horizontalOverflowPx: Math.max(0, root.scrollWidth - viewport.width),
      verticalOverflowPx: Math.max(0, root.scrollHeight - viewport.height),
      overflowOffenders,
      appShell,
      gameScreen,
      gameLayout,
      liveRow,
      sideColumn,
      board,
      masthead,
      legacyCommandDeck,
      immersive: document.body.classList.contains('war-room-immersive-active'),
      overflow,
      boardViewportFill: Number((boardVisibleHeight / viewport.height).toFixed(3)),
      boardWidthFill: board ? Number((board.width / viewport.width).toFixed(3)) : 0,
      boardVisibleWidthFill: Number((boardVisibleWidth / viewport.width).toFixed(3)),
    };
  }, label);
}

async function openCanonicalWarRoom(page, { variant = 'classic' } = {}) {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  if (variant === 'v2') {
    await installWarRoomV2RevisionRoute(page);
  }
  if (variant === 'v3') {
    await installWarRoomV3RevisionRoute(page);
  }
  await page.addInitScript(({ key, value }) => {
    window.localStorage.setItem(key, value);
  }, { key: WAR_ROOM_VARIANT_STORAGE_KEY, value: variant });
  await mockApi(page, {
    profileSeed: {
      ...SEEN_WAR_ROOM_TUTORIAL_PROFILE,
      'matthias.onboarded': '2',
      'chess-study-home-guide-dismissed-v1': '1',
    },
  });
  await login(page);
  expect(
    await page.evaluate((key) => window.localStorage.getItem(key), WAR_ROOM_VARIANT_STORAGE_KEY),
    'requested War Room variant must survive application bootstrap',
  ).toBe(variant);

  await buttonWithVisibleText(page, 'Partida rápida').click();
  await page.getByRole('button', { name: 'Empezar partida', exact: true }).click();
  // Immersion is now the default War Room presentation, so the persistent
  // status pill is intentionally absent. Gate on the actual game screen and
  // mounted 3D War Room instead of requiring UI that immersion hides.
  await expect(page.locator('.game-screen')).toBeAttached({ timeout: 60_000 });

  const board3d = await open3DFromAppearance(page);
  await expect(board3d).toBeVisible({ timeout: 60_000 });
  const canvas = page.locator('.board3d-main-canvas');
  await expect(canvas).toBeVisible({ timeout: 30_000 });
  await expect(board3d).toHaveAttribute('data-board3d-camera', 'fixed-tactical', { timeout: 30_000 });
  await expect(page.getByRole('button', { name: 'Más acciones de partida', exact: true })).toBeVisible();

  const tutorial = page.locator('[data-war-room-first-run-tutorial="true"]');
  if (await tutorial.isVisible().catch(() => false)) {
    await tutorial.getByRole('button', { name: /Saltar|Continuar/ }).click();
    await expect(tutorial).toBeHidden();
  }

  if (!['v2', 'v3'].includes(variant)) {
    // The cat is classic-shell decor; keep that canary there without making
    // the Blender v2 proof depend on hidden legacy geometry.
    await expect(canvas).toHaveAttribute('data-war-room-cat-rendered', 'true', { timeout: 30_000 });
    await expect(canvas).toHaveAttribute('data-war-room-cat-version', WAR_ROOM_CAT_VERSION);
    await expect(canvas).toHaveAttribute('data-war-room-cat-count', '1');
    await expect(canvas).toHaveAttribute('data-war-room-cat-placement', /^(left|right)-sofa-sleeper-v1$/);
    await expect(canvas).toHaveAttribute('data-war-room-cat-sofa-side', /^(left|right)$/);
  }
  return board3d;
}

function expectSharedHealth(health) {
  expect(health.horizontalOverflowPx, `${health.label} must not overflow horizontally`).toBeLessThanOrEqual(1);
  expect(health.board?.width, `${health.label} must render the 3D scene`).toBeGreaterThan(0);
  expect(health.board?.height, `${health.label} must render the 3D scene`).toBeGreaterThan(0);
  expect(health.boardVisibleWidthFill, `${health.label} must keep the scene meaningfully visible`).toBeGreaterThan(0.4);
}

function expectPortraitHealth(health) {
  expect(health.coarsePointer, 'Android capture must emulate a coarse pointer').toBe(true);
  expect(health.touchPoints, 'Android capture must expose touch points').toBeGreaterThan(0);
  expect(health.legacyCommandDeck?.display, 'legacy Focus/Abandon row must stay visually folded').toBe('none');
  expect(health.boardWidthFill, '3D scene should remain the dominant mobile surface').toBeGreaterThanOrEqual(0.88);
  expect(health.overflow, 'immersive overflow must remain available in portrait').not.toBeNull();
}

function expectImmersiveHealth(health) {
  expect(health.immersive, 'immersive state must be active').toBe(true);
  expect(health.gameLayout?.left, 'immersive shell must start at the left viewport edge').toBeLessThanOrEqual(1);
  expect(health.gameLayout?.top, 'immersive shell must start at the top viewport edge').toBeLessThanOrEqual(1);
  expect(health.gameLayout?.width, 'immersive shell must span the viewport width').toBeGreaterThanOrEqual(health.viewport.width - 2);
  expect(health.gameLayout?.height, 'immersive shell must span the viewport height').toBeGreaterThanOrEqual(health.viewport.height - 2);
  expect(health.boardViewportFill, 'immersive scene should use nearly the full viewport height').toBeGreaterThanOrEqual(0.97);
}

function expectLandscapeHealth(health) {
  expect(health.verticalOverflowPx, 'Android landscape must fit the play-first War Room in one viewport').toBeLessThanOrEqual(1);
  expect(health.legacyCommandDeck?.display, 'Android landscape must not revive the legacy command row').toBe('none');
  expect(health.board?.left, 'Android landscape keeps the board in the primary left pane').toBeLessThan(80);
  expect(health.boardViewportFill, 'Android landscape should spend most viewport height on the board').toBeGreaterThanOrEqual(0.62);
  expect(health.boardWidthFill, 'Android landscape keeps a substantial board surface').toBeGreaterThanOrEqual(0.58);
}

let sharedVisualBrowser;

test.beforeAll(async () => {
  sharedVisualBrowser = await chromium.launch({
    headless: true,
    args: LOCAL_GPU_CAPTURE
      ? [
        '--use-gl=angle',
        '--use-angle=gl',
        '--ignore-gpu-blocklist',
        '--enable-gpu-rasterization',
      ]
      : [
        '--use-gl=angle',
        '--use-angle=swiftshader',
        '--enable-unsafe-swiftshader',
      ],
  });
});

test.afterAll(async () => {
  await sharedVisualBrowser?.close();
});

for (const profile of ACTIVE_CAPTURE_PROFILES) {
  test(`War Room · captura visual canónica ${profile.title}`, async () => {
    test.setTimeout(120_000);
    await mkdir(ARTIFACT_DIR, { recursive: true });

    const context = await sharedVisualBrowser.newContext({
      viewport: profile.viewport,
      hasTouch: profile.hasTouch,
    });
    await context.addInitScript(({ spyOrientation }) => {
      Object.defineProperty(navigator, 'hardwareConcurrency', {
        configurable: true,
        get: () => 8,
      });
      if (spyOrientation) {
        window.__warRoomOrientationLocks = [];
        const orientation = screen.orientation;
        if (orientation) {
          Object.defineProperty(orientation, 'lock', {
            configurable: true,
            value: async (mode) => { window.__warRoomOrientationLocks.push(mode); },
          });
        }
      }
    }, { spyOrientation: Boolean(profile.hasTouch) });

    const page = await context.newPage();
    try {
      const board3d = await openCanonicalWarRoom(page, { variant: profile.variant || 'classic' });
      if (LOCAL_GPU_CAPTURE) {
        const canvas = page.locator('.board3d-main-canvas');
        await expect(canvas).toHaveAttribute('data-board3d-renderer', /.+/);
        await expect(canvas).not.toHaveAttribute(
          'data-board3d-renderer',
          /swiftshader|llvmpipe|software/i,
        );
      }
      if (['v2', 'v3'].includes(profile.variant)) {
        await expect(board3d).toHaveAttribute('data-board3d-variant', profile.variant);
        expect(
          await page.locator('.board3d-main-canvas').getAttribute('data-war-room-variant-error'),
          `${profile.variant} shell must load without falling back to classic`,
        ).toBeNull();
        await expect(page.locator('.board3d-main-canvas'))
          .toHaveAttribute('data-war-room-variant', profile.variant, { timeout: 30_000 });
        await expect(page.locator('.board3d-main-canvas'))
          .toHaveAttribute('data-war-room-variant-status', 'ready', { timeout: 30_000 });
      }
      if (profile.variant === 'v3') {
        const variantMenu = page.getByRole('button', { name: 'Más acciones de partida', exact: true });
        await variantMenu.click();
        await expect(page.getByRole('menuitemradio', { name: 'War Room v1', exact: true })).toBeVisible();
        await expect(page.getByRole('menuitemradio', { name: 'War Room v2', exact: true })).toBeVisible();
        await expect(page.getByRole('menuitemradio', { name: 'War Room v3', exact: true }))
          .toHaveAttribute('aria-checked', 'true');
        await variantMenu.click();
      }

      // Immersion is the canonical War Room presentation on desktop and
      // mobile. Every visual profile must exercise the same live contract.
      const immersiveRoot = '.game-layout-immersive';
        await expect(page.locator(immersiveRoot)).toBeVisible();
        await expect(page.locator(immersiveRoot)).toHaveAttribute('data-war-room-immersive', 'true');
        await expect(page.locator('body')).toHaveClass(/war-room-immersive-active/);
        await expect(page.getByRole('button', { name: 'Entrar en modo inmersión', exact: true })).toHaveCount(0);
        const immersiveMenu = page.getByRole('button', { name: 'Más acciones de partida', exact: true });
        await expect(immersiveMenu).toBeVisible();
        const menuBox = await immersiveMenu.boundingBox();
        expect(menuBox, 'immersive overflow must have a rendered hit target').not.toBeNull();
        expect(menuBox.x, 'immersive overflow must stay inside the left viewport edge').toBeGreaterThanOrEqual(0);
        expect(menuBox.y, 'immersive overflow must stay inside the top viewport edge').toBeGreaterThanOrEqual(0);
        expect(menuBox.x + menuBox.width, 'immersive overflow must stay inside the right viewport edge')
          .toBeLessThanOrEqual(profile.viewport.width + 1);
        expect(menuBox.y + menuBox.height, 'immersive overflow must stay inside the bottom viewport edge')
          .toBeLessThanOrEqual(profile.viewport.height + 1);
        if (profile.hasTouch) {
          expect(menuBox.width, 'touch overflow target width').toBeGreaterThanOrEqual(44);
          expect(menuBox.height, 'touch overflow target height').toBeGreaterThanOrEqual(44);
        }
        await immersiveMenu.click();
        await expect(page.getByRole('menu', { name: 'Acciones de partida', exact: true })).toBeVisible();
        await immersiveMenu.click();
        if (profile.hasTouch) {
          await expect.poll(() => page.evaluate(() => window.__warRoomOrientationLocks || []))
            .toContain('landscape');
        }
        const immersiveCanvas = page.locator(`${immersiveRoot} .board3d-main-canvas`);
        await expect(immersiveCanvas).toHaveCount(1);
        const immersiveVisibility = await page.evaluate(() => {
          const root = '.game-layout-immersive';
          const selectors = [
            `${root} .board3d-main-canvas`,
            `${root} .board3d-main-shell`,
            `${root} .game-board-3d-stage`,
            `${root} .game-board-stack-3d`,
            `${root} .board-live-row.is-3d-warroom`,
            `${root} .board-column`,
            root,
          ];
          return selectors.map((selector) => {
            const node = document.querySelector(selector);
            if (!node) return { selector, missing: true };
            const style = getComputedStyle(node);
            const rect = node.getBoundingClientRect();
            return {
              selector,
              display: style.display,
              visibility: style.visibility,
              opacity: style.opacity,
              overflow: style.overflow,
              position: style.position,
              width: Number(rect.width.toFixed(1)),
              height: Number(rect.height.toFixed(1)),
              top: Number(rect.top.toFixed(1)),
              left: Number(rect.left.toFixed(1)),
            };
          });
        });
        console.log('WAR_ROOM_IMMERSIVE_VISIBILITY', JSON.stringify(immersiveVisibility));
        await expect(immersiveCanvas).toBeVisible();
        // Classic War Room decor is a stronger scene canary than a mounted
        // canvas: if Klaus exists, the room graph itself has rendered.
        if (!['v2', 'v3'].includes(profile.variant)) {
          await expect(immersiveCanvas).toHaveAttribute('data-war-room-cat-rendered', 'true', { timeout: 30_000 });
          await expect(immersiveCanvas).toHaveAttribute('data-war-room-cat-count', '1');
        }
        await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      await page.waitForTimeout(350);
      await page.screenshot({
        path: `${ARTIFACT_DIR}/${profile.label}.png`,
        fullPage: false,
        animations: 'disabled',
      });

      if (profile.portraitContract) {
        const overflow = page.getByRole('button', { name: 'Más acciones de partida', exact: true });
        await expect(overflow).toBeVisible();
        await expect(page.getByRole('button', { name: 'Focus', exact: true })).toHaveCount(0);
        await expect(page.getByRole('button', { name: 'Abandonar partida', exact: true })).toHaveCount(0);
        await overflow.click();
        await expect(page.getByRole('menuitem', { name: 'Abandonar partida', exact: true })).toBeVisible();
        await overflow.click();
      }

      await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      await page.waitForTimeout(350);

      const health = await captureWarRoomHealth(page, profile.label);
      await writeFile(
        `${ARTIFACT_DIR}/${profile.label}-health.json`,
        `${JSON.stringify({ schema: 3, capture: health }, null, 2)}\n`,
        'utf8',
      );

      expectSharedHealth(health);
      if (profile.hasTouch) {
        expect(health.coarsePointer, `${profile.title} must emulate a coarse pointer`).toBe(true);
        expect(health.touchPoints, `${profile.title} must expose touch points`).toBeGreaterThan(0);
      } else {
        expect(health.coarsePointer, 'Desktop capture must retain a fine pointer').toBe(false);
      }
      if (profile.portraitContract) expectPortraitHealth(health);
      if (profile.landscapeContract) expectLandscapeHealth(health);
      expectImmersiveHealth(health);
      await freezeVisualFrame(page);
      await captureViewportPng(
        context,
        page,
        `${ARTIFACT_DIR}/${profile.label}.png`,
      );
    } finally {
      await context.close();
    }
  });
}

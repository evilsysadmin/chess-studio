import { chromium, expect, test } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { buttonWithVisibleText, login, mockApi } from './helpers.js';
import { WAR_ROOM_CAT_VERSION } from '../frontend/src/components/WarRoomCatDecor.js';

const ARTIFACT_DIR = '../.artifacts/app-visual';
const WAR_ROOM_VARIANT_STORAGE_KEY = 'chess-study-war-room-variant-v1';
const WAR_ROOM_V2_REVISION_BASE =
  'https://assets.chess-studio.shadowops.dpdns.org/war-room/v2/staging/revisions';

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

  await page.route('**/war-room/v2/staging/current.glb*', async (route) => {
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
    label: 'war-room-v2-desktop-1440x900',
    title: 'War Room v2 desktop 1440×900',
    viewport: Object.freeze({ width: 1440, height: 900 }),
    hasTouch: false,
    portraitContract: false,
    landscapeContract: false,
    variant: 'v2',
  }),
]);

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
  // viewport screenshot capture scene + HUD together.
  const staged = await page.evaluate(() => {
    const canvases = [...document.querySelectorAll('canvas.board3d-main-canvas')];
    return canvases.map((canvas, index) => {
      const rect = canvas.getBoundingClientRect();
      const image = document.createElement('img');
      image.src = canvas.toDataURL('image/png');
      image.alt = '';
      image.dataset.warRoomWebglCapture = String(index);
      Object.assign(image.style, {
        position: 'fixed',
        left: `${rect.left}px`,
        top: `${rect.top}px`,
        width: `${rect.width}px`,
        height: `${rect.height}px`,
        zIndex: '1',
        pointerEvents: 'none',
        objectFit: 'fill',
      });
      document.body.appendChild(image);
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
    const board = box('[data-board3d-war-room="true"]');
    const hud = box('.game-3d-matthias-card');
    const human = box('.game-board-stack-3d .game-player-rail.is-human');
    const music = box('.game-side-column-3d .game-side-music .music-deck-collapsed');
    const notation = box('.game-side-column-3d .game-notation-disclosure');
    const legacyCommandDeck = box('.game-board-stack-3d > .game-command-deck');
    const masthead = box('.masthead-game-compact');
    const appShell = box('.app-shell-board-game');
    const gameScreen = box('.game-screen');
    const gameLayout = box('.game-layout.game-layout-3d');
    const liveRow = box('.board-live-row.is-3d-warroom');
    const sideColumn = box('.game-side-column.game-side-column-3d');
    const focus = buttonBox('Focus');
    const abandon = buttonBox('Abandonar partida');
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
      horizontalOverflowPx: Math.max(0, root.scrollWidth - viewport.width),
      verticalOverflowPx: Math.max(0, root.scrollHeight - viewport.height),
      overflowOffenders,
      appShell,
      gameScreen,
      gameLayout,
      liveRow,
      sideColumn,
      board,
      hud,
      masthead,
      human,
      music,
      notation,
      legacyCommandDeck,
      quickActions: { focus, abandon, overflow },
      boardViewportFill: Number((boardVisibleHeight / viewport.height).toFixed(3)),
      boardWidthFill: board ? Number((board.width / viewport.width).toFixed(3)) : 0,
      boardVisibleWidthFill: Number((boardVisibleWidth / viewport.width).toFixed(3)),
      hudToBoardGap: board && hud ? Number((board.top - hud.bottom).toFixed(1)) : null,
      playerToBoardGap: board && human ? Number((human.top - board.bottom).toFixed(1)) : null,
    };
  }, label);
}

async function openCanonicalWarRoom(page, { variant = 'classic' } = {}) {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  if (variant === 'v2') {
    await installWarRoomV2RevisionRoute(page);
  }
  await page.addInitScript(({ key, value }) => {
    window.localStorage.setItem(key, value);
  }, { key: WAR_ROOM_VARIANT_STORAGE_KEY, value: variant });
  await mockApi(page, {
    profileSeed: {
      'matthias.onboarded': '2',
      'chess-study-home-guide-dismissed-v1': '1',
    },
  });
  await login(page);

  await buttonWithVisibleText(page, 'Partida rápida').click();
  await page.getByRole('button', { name: 'Empezar partida', exact: true }).click();
  await expect(page.locator('.game-screen')).toBeVisible({ timeout: 30_000 });

  const board3d = await open3DFromAppearance(page);
  const canvas = page.locator('.board3d-main-canvas');
  await expect(canvas).toBeVisible({ timeout: 30_000 });
  await expect(board3d).toHaveAttribute('data-board3d-camera', 'fixed-tactical', { timeout: 30_000 });
  await expect(page.locator('.game-3d-matthias-card')).toBeVisible();

  const tutorial = page.locator('[data-war-room-first-run-tutorial="true"]');
  if (await tutorial.isVisible().catch(() => false)) {
    await tutorial.getByRole('button', { name: /Saltar|Continuar/ }).click();
    await expect(tutorial).toBeHidden();
  }

  if (variant !== 'v2') {
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
  expect(health.hud?.height, 'compact Matthias HUD height').toBeLessThanOrEqual(72);
  expect(health.legacyCommandDeck?.display, 'legacy Focus/Abandon row must stay visually folded').toBe('none');
  expect(health.boardWidthFill, '3D scene should remain the dominant mobile surface').toBeGreaterThanOrEqual(0.88);
  expect(health.hudToBoardGap, 'HUD should sit directly above the board').toBeLessThanOrEqual(20);
  expect(health.human?.height, 'human rail height').toBeLessThanOrEqual(50);
  expect(health.music?.height, 'music rail height').toBeLessThanOrEqual(50);
  expect(health.notation?.height, 'notation rail height').toBeLessThanOrEqual(50);
  expect(Math.abs((health.music?.top ?? 0) - (health.notation?.top ?? 0)), 'music/notebook row alignment').toBeLessThanOrEqual(2);
}

function expectLandscapeHealth(health) {
  expect(health.verticalOverflowPx, 'Android landscape must fit the play-first War Room in one viewport').toBeLessThanOrEqual(1);
  expect(health.legacyCommandDeck?.display, 'Android landscape must not revive the legacy command row').toBe('none');
  expect(health.board?.left, 'Android landscape keeps the board in the primary left pane').toBeLessThan(80);
  expect(health.boardViewportFill, 'Android landscape should spend most viewport height on the board').toBeGreaterThanOrEqual(0.62);
  expect(health.boardWidthFill, 'Android landscape keeps a substantial board surface').toBeGreaterThanOrEqual(0.58);
  expect(health.human?.bottom, 'Android landscape player rail must stay inside the viewport').toBeLessThanOrEqual(health.viewport.height + 1);
}

for (const profile of CAPTURE_PROFILES) {
  test(`War Room · captura visual canónica ${profile.title}`, async () => {
    test.setTimeout(120_000);
    await mkdir(ARTIFACT_DIR, { recursive: true });

    const browser = await chromium.launch({
      headless: true,
      args: [
        '--use-gl=angle',
        '--use-angle=swiftshader',
        '--enable-unsafe-swiftshader',
      ],
    });

    const context = await browser.newContext({
      viewport: profile.viewport,
      hasTouch: profile.hasTouch,
    });
    await context.addInitScript(() => {
      Object.defineProperty(navigator, 'hardwareConcurrency', {
        configurable: true,
        get: () => 8,
      });
    });

    const page = await context.newPage();
    try {
      await openCanonicalWarRoom(page, { variant: profile.variant || 'classic' });
      if (profile.variant === 'v2') {
        await expect(page.locator('.board3d-main-canvas'))
          .toHaveAttribute('data-war-room-variant', 'v2', { timeout: 30_000 });
        await expect(page.locator('.board3d-main-canvas'))
          .toHaveAttribute('data-war-room-v2-status', 'ready', { timeout: 30_000 });
      }

      if (profile.portraitContract) {
        await expect(page.getByRole('button', { name: 'Focus', exact: true })).toBeVisible();
        await expect(page.getByRole('button', { name: 'Abandonar partida', exact: true })).toBeVisible();
        await expect(page.getByRole('button', { name: 'Más acciones de partida', exact: true })).toBeVisible();
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

      await freezeVisualFrame(page);
      await captureViewportPng(
        context,
        page,
        `${ARTIFACT_DIR}/${profile.label}.png`,
      );
    } finally {
      await context.close();
      await browser.close();
    }
  });
}

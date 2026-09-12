import { chromium, expect, test } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { buttonWithVisibleText, gameTurn, login, mockApi } from './helpers.js';

const ARTIFACT_DIR = '../.artifacts/app-visual';
const VIEWPORT = { width: 390, height: 844 };

async function open3DFromAppearance(page) {
  const board3d = page.locator('[data-board3d-war-room="true"]');
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
  }
}

async function captureWarRoomHealth(page) {
  return page.evaluate(() => {
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
    const buttonBox = (label) => {
      const node = [...document.querySelectorAll('button')]
        .find((candidate) => (candidate.getAttribute('aria-label') || '').trim() === label);
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

    const root = document.documentElement;
    const board = box('[data-board3d-war-room="true"]');
    const hud = box('.game-3d-matthias-card');
    const human = box('.game-board-stack-3d .game-player-rail.is-human');
    const music = box('.game-side-column-3d .game-side-music .music-deck-collapsed');
    const notation = box('.game-side-column-3d .game-notation-disclosure');
    const legacyCommandDeck = box('.game-board-stack-3d > .game-command-deck');
    const masthead = box('.masthead-game-compact');
    const focus = buttonBox('Focus');
    const abandon = buttonBox('Abandonar partida');
    const overflow = buttonBox('Más acciones de partida');
    const boardVisibleHeight = board
      ? Math.max(0, Math.min(board.bottom, viewport.height) - Math.max(board.top, 0))
      : 0;

    return {
      label: 'war-room-android-390x844',
      viewport,
      dpr: window.devicePixelRatio,
      hardwareConcurrency: navigator.hardwareConcurrency,
      touchPoints: navigator.maxTouchPoints,
      coarsePointer: window.matchMedia('(pointer: coarse)').matches,
      horizontalOverflowPx: Math.max(0, root.scrollWidth - root.clientWidth),
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
      hudToBoardGap: board && hud ? Number((board.top - hud.bottom).toFixed(1)) : null,
      playerToBoardGap: board && human ? Number((human.top - board.bottom).toFixed(1)) : null,
    };
  });
}

test('War Room · captura visual canónica Android portrait', async () => {
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
    viewport: VIEWPORT,
    hasTouch: true,
  });
  await context.addInitScript(() => {
    Object.defineProperty(navigator, 'hardwareConcurrency', {
      configurable: true,
      get: () => 8,
    });
  });

  const page = await context.newPage();
  try {
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await mockApi(page, {
      profileSeed: {
        'matthias.onboarded': '2',
        'chess-study-home-guide-dismissed-v1': '1',
      },
    });
    await login(page);

    await buttonWithVisibleText(page, 'Partida rápida').click();
    await page.getByRole('button', { name: 'Empezar partida', exact: true }).click();
    await expect(gameTurn(page)).toBeVisible();

    const board3d = await open3DFromAppearance(page);
    const canvas = page.locator('.board3d-main-canvas');
    await expect(canvas).toBeVisible({ timeout: 30_000 });
    await expect(board3d).toHaveAttribute('data-board3d-camera', 'fixed-tactical', { timeout: 30_000 });
    await expect(page.locator('.game-3d-matthias-card')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Focus', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Abandonar partida', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Más acciones de partida', exact: true })).toBeVisible();

    await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    await page.waitForTimeout(350);

    const health = await captureWarRoomHealth(page);
    await writeFile(
      `${ARTIFACT_DIR}/war-room-android-390x844-health.json`,
      `${JSON.stringify({ schema: 1, capture: health }, null, 2)}\n`,
      'utf8',
    );

    expect(health.coarsePointer, 'Android capture must emulate a coarse pointer').toBe(true);
    expect(health.touchPoints, 'Android capture must expose touch points').toBeGreaterThan(0);
    expect(health.horizontalOverflowPx, 'War Room must not overflow horizontally').toBeLessThanOrEqual(1);
    expect(health.hud?.height, 'compact Matthias HUD height').toBeLessThanOrEqual(72);
    expect(health.legacyCommandDeck?.display, 'legacy Focus/Abandon row must stay visually folded').toBe('none');
    expect(health.boardWidthFill, '3D scene should remain the dominant mobile surface').toBeGreaterThanOrEqual(0.88);
    expect(health.hudToBoardGap, 'HUD should sit directly above the board').toBeLessThanOrEqual(20);
    expect(health.human?.height, 'human rail height').toBeLessThanOrEqual(50);
    expect(health.music?.height, 'music rail height').toBeLessThanOrEqual(50);
    expect(health.notation?.height, 'notation rail height').toBeLessThanOrEqual(50);
    expect(Math.abs((health.music?.top ?? 0) - (health.notation?.top ?? 0)), 'music/notebook row alignment').toBeLessThanOrEqual(2);

    await freezeVisualFrame(page);
    await captureViewportPng(
      context,
      page,
      `${ARTIFACT_DIR}/war-room-android-390x844.png`,
    );
  } finally {
    await context.close();
    await browser.close();
  }
});

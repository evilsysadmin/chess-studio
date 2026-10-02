import { expect, test } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { login, mockApi } from './helpers.js';
import { decodePng } from './png-pixels.js';

const ARTIFACT_DIR = '../.artifacts/app-visual/pvp-duel-room';
const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
const DUEL_RUNTIME_PATTERN = '**/pvp/duel-room/runtime/pvp-duel-room-shell-*.glb*';
const DUEL_STAGING_REVISION_BASE =
  'https://assets.chess-studio.shadowops.dpdns.org/pvp/duel-room/staging/revisions';

async function routeExpectedDuelRevision(page) {
  const revision = String(process.env.APP_VISUAL_EXPECTED_PVP_DUEL_REVISION || '').trim();
  if (!revision) return () => 0;

  let requests = 0;
  const revisionUrl = `${DUEL_STAGING_REVISION_BASE}/${revision}.glb?visual=${revision}`;
  await page.route(DUEL_RUNTIME_PATTERN, async (route) => {
    requests += 1;
    const requestedUrl = route.request().url();
    expect(
      requestedUrl.includes('/pvp/duel-room/runtime/pvp-duel-room-shell-'),
      'Duel Room app must request a content-addressed immutable runtime URL',
    ).toBe(true);
    const response = await route.fetch({ url: revisionUrl });
    if (!response.ok()) {
      throw new Error(`PvP Duel Room staging revision failed: ${response.status()} ${revisionUrl}`);
    }
    await route.fulfill({ response });
  });
  return () => requests;
}

function matchPayload() {
  return {
    id: 'pvp-duel-visual-1',
    white: 'e2e',
    black: 'bob',
    whiteRating: 1050,
    blackRating: 1210,
    fen: START_FEN,
    turn: 'w',
    status: 'active',
    result: null,
    history: [],
    revision: 0,
    youAre: 'w',
    yourTurn: true,
    createdAt: '2026-09-29T05:00:00Z',
    updatedAt: '2026-09-29T05:00:00Z',
    opponentPresence: 'online',
    clock: { id: '30+0', whiteMs: 1800000, blackMs: 1800000, incrementMs: 0, runningColor: 'w' },
  };
}

async function openDuelRoom(page, viewport) {
  await page.setViewportSize(viewport);
  await mockApi(page);
  const duelRevisionRequests = await routeExpectedDuelRevision(page);

  const match = matchPayload();
  await page.route('**/api/pvp/lobby', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({
      roster: [
        { username: 'e2e', rating: 1050, tier: 'Intermedio', isSelf: true },
        { username: 'bob', rating: 1210, tier: 'Intermedio', isSelf: false },
      ],
      challenges: [{
        id: 'challenge-pvp-duel-visual',
        challenger: 'bob',
        opponent: 'e2e',
        challengerRating: 1210,
        opponentRating: 1050,
        status: 'pending',
        direction: 'incoming',
      }],
      activeMatch: null,
      pollAfterMs: 3000,
    }),
  }));
  await page.route('**/api/pvp/challenges/challenge-pvp-duel-visual/accept', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ match }),
  }));
  await page.route('**/api/pvp/matches/pvp-duel-visual-1', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ match, pollAfterMs: 5000 }),
  }));

  await login(page);
  await page.getByRole('button', { name: 'Abrir Sala de Duelos 1 contra 1' }).click();

  const lobby = page.getByRole('dialog', { name: 'Duelo 1 contra 1 · War Room' });
  await expect(lobby).toBeVisible();
  await lobby.getByRole('button', { name: 'Aceptar', exact: true }).click();

  const room = page.getByRole('region', { name: 'Sala de duelo 1 contra 1' });
  await expect(room).toBeVisible();
  const board = room.locator('[data-board3d-war-room="true"]');
  const canvas = board.locator('.board3d-main-canvas');
  await expect(canvas).toBeVisible({ timeout: 45_000 });
  await expect(canvas).toHaveAttribute('data-war-room-variant', 'duel', { timeout: 60_000 });
  await expect(canvas).toHaveAttribute('data-war-room-variant-status', 'ready', { timeout: 60_000 });
  await expect(canvas).toHaveAttribute('data-board3d-piece-built', '32', { timeout: 45_000 });
  if (String(process.env.APP_VISUAL_EXPECTED_PVP_DUEL_REVISION || '').trim()) {
    expect(duelRevisionRequests(), 'Duel Room capture must request immutable runtime and render the PR staging revision').toBeGreaterThan(0);
  }

  const [roomBox, boardBox] = await Promise.all([room.boundingBox(), board.boundingBox()]);
  expect(roomBox).not.toBeNull();
  expect(boardBox).not.toBeNull();
  const isCompactLandscape = viewport.width > viewport.height && viewport.height <= 520;
  const minBoardWidthRatio = isCompactLandscape ? 0.95 : 0.96;
  expect(
    boardBox.width / roomBox.width,
    `Duel Room board should remain effectively full-width (${Math.round(minBoardWidthRatio * 100)}% minimum)`,
  ).toBeGreaterThan(minBoardWidthRatio);
  expect(Math.abs((boardBox.x + boardBox.width / 2) - (roomBox.x + roomBox.width / 2)) / roomBox.width)
    .toBeLessThan(0.02);
  if (isCompactLandscape) {
    expect(
      boardBox.height / roomBox.height,
      'compact landscape Duel Room board must fill the room height like canonical War Room',
    ).toBeGreaterThan(0.98);
    expect(
      Math.abs((boardBox.y + boardBox.height) - (roomBox.y + roomBox.height)),
      'compact landscape Duel Room must not leave a bottom black moat',
    ).toBeLessThanOrEqual(2);
  }
  await expect(room.getByText('DUEL ROOM · 1 VS 1', { exact: true })).toHaveCount(0);

  await page.waitForTimeout(900);
  await mkdir(ARTIFACT_DIR, { recursive: true });

  const horizontal = await page.evaluate(() => {
    const root = document.documentElement;
    const viewportWidth = root.clientWidth;
    const offenders = [...document.querySelectorAll('body *')]
      .map((element) => {
        const rect = element.getBoundingClientRect();
        return {
          tag: element.tagName,
          className: typeof element.className === 'string' ? element.className.slice(0, 120) : '',
          left: Math.round(rect.left),
          right: Math.round(rect.right),
          width: Math.round(rect.width),
        };
      })
      .filter(({ left, right }) => left < -1 || right > viewportWidth + 1)
      .slice(0, 8);
    return { overflow: root.scrollWidth - viewportWidth, offenders };
  });
  expect(
    horizontal.overflow,
    'horizontal overflow offenders: ' + JSON.stringify(horizontal.offenders),
  ).toBeLessThanOrEqual(1);
  return { room, board, canvas };
}

function assertRenderedDuelRoomPng(png, label) {
  const { width, height, pixels } = decodePng(png);
  let lumaTotal = 0;
  let lumaSqTotal = 0;
  let lit = 0;
  const samples = width * height;
  for (let i = 0; i < samples; i += 1) {
    const r = pixels[i * 4];
    const g = pixels[i * 4 + 1];
    const b = pixels[i * 4 + 2];
    const luma = (r * 0.2126) + (g * 0.7152) + (b * 0.0722);
    lumaTotal += luma;
    lumaSqTotal += luma * luma;
    if (luma > 30) lit += 1;
  }
  const avgLuma = samples ? lumaTotal / samples : 0;
  const variance = samples ? Math.max(0, (lumaSqTotal / samples) - (avgLuma * avgLuma)) : 0;
  const stdLuma = Math.sqrt(variance);
  const litFraction = samples ? lit / samples : 0;

  expect(samples, label + ' must contain sampled pixels').toBeGreaterThan(0);
  expect(stdLuma, label + ' is visually flat/blank; Duel Room likely did not render').toBeGreaterThan(20);
  expect(litFraction, label + ' is too dark/empty; Duel Room likely did not render').toBeGreaterThan(0.15);
}

async function forceFreshDuelFrame(page, viewport) {
  // Chromium + SwiftShader may discard an idle WebGL backbuffer even though
  // the scene is mounted and ready. Nudge the host by 1 px so ResizeObserver
  // drives Board3D's real resize()->render() path immediately before capture.
  const nudged = { width: Math.max(320, viewport.width - 1), height: viewport.height };
  await page.setViewportSize(nudged);
  await page.waitForTimeout(60);
  await page.setViewportSize(viewport);
  await page.evaluate(() => new Promise((resolve) => (
    requestAnimationFrame(() => requestAnimationFrame(resolve))
  )));
  await page.waitForTimeout(80);
}

async function captureDuelRoomFromCompositor(page, room, path) {
  // Use Chromium's compositor screenshot, not Locator.screenshot(). An idle
  // WebGL canvas does not preserve its backbuffer; element screenshots can
  // therefore capture HUD chrome plus an empty canvas under SwiftShader.
  const box = await room.boundingBox();
  if (!box) throw new Error('Could not resolve Duel Room bounding box for capture');
  return page.screenshot({
    path,
    clip: box,
    animations: 'disabled',
  });
}

async function assertMobileTouchTargets(room) {
  const topbarButton = room.locator('.pvp-war-room__exit').first();
  const utility = room.locator('.pvp-war-room__duel-pill .game-3d-utility-menu>summary');
  for (const target of [topbarButton, utility]) {
    const box = await target.boundingBox();
    expect(box).not.toBeNull();
    expect(box.width).toBeGreaterThanOrEqual(44);
    expect(box.height).toBeGreaterThanOrEqual(44);
  }
}

test('PvP Duel Room · runtime desktop visual artifact', async ({ page }) => {
  test.setTimeout(120_000);
  const viewport = { width: 1440, height: 900 };
  const { room } = await openDuelRoom(page, viewport);
  await forceFreshDuelFrame(page, viewport);
  const png = await captureDuelRoomFromCompositor(
    page,
    room,
    ARTIFACT_DIR + '/pvp-duel-room-desktop-1440x900.png',
  );
  assertRenderedDuelRoomPng(png, 'desktop Duel Room');
});

test.describe('PvP Duel Room · mobile touch orientation', () => {
  test.use({ hasTouch: true, isMobile: true });

  test('runtime Android portrait visual artifact', async ({ page }) => {
    test.setTimeout(120_000);
    const viewport = { width: 390, height: 844 };
    const { room } = await openDuelRoom(page, viewport);
    await assertMobileTouchTargets(room);
    await expect(page.getByRole('button', { name: 'Activar apaisado', exact: true })).toBeVisible();
    const png = await captureDuelRoomFromCompositor(
      page,
      room,
      ARTIFACT_DIR + '/pvp-duel-room-android-390x844.png',
    );
    assertRenderedDuelRoomPng(png, 'portrait Duel Room');
  });

  test('runtime Android landscape visual artifact', async ({ page }) => {
    test.setTimeout(120_000);
    const viewport = { width: 844, height: 390 };
    const { room } = await openDuelRoom(page, viewport);
    await expect(page.getByRole('button', { name: 'Activar apaisado', exact: true })).toHaveCount(0);
    const png = await captureDuelRoomFromCompositor(
      page,
      room,
      ARTIFACT_DIR + '/pvp-duel-room-android-landscape-844x390.png',
    );
    assertRenderedDuelRoomPng(png, 'landscape Duel Room');
    await assertMobileTouchTargets(room);
    const verticalOverflow = await page.evaluate(
      () => document.documentElement.scrollHeight - document.documentElement.clientHeight,
    );
    expect(verticalOverflow).toBeLessThanOrEqual(1);
  });
});

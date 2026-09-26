import { chromium, expect, test } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { buttonWithVisibleText, login, mockApi } from './helpers.js';
import { warRoomHansEventForGame } from '../frontend/src/components/WarRoomHansEventContract.js';

const ARTIFACT_DIR = '../.artifacts/app-visual';
const LABEL = 'war-room-hans-desktop-1440x900';
const MAX_GROUND_GAP = 0.005;

function firstE2EFireGameIndex() {
  for (let index = 1; index <= 64; index += 1) {
    if (warRoomHansEventForGame(`e2e-game-${index}`) === 'fire') return index;
  }
  throw new Error('Hans visual canary could not find a deterministic fire game id');
}

async function seedGamesBeforeFire(page) {
  const fireIndex = firstE2EFireGameIndex();
  if (fireIndex <= 1) return;
  await page.evaluate(async (count) => {
    for (let index = 1; index < count; index += 1) {
      await fetch('http://localhost:4000/api/games', {
        method: 'POST',
        mode: 'no-cors',
        headers: { 'Content-Type': 'text/plain' },
        body: '{}',
      });
    }
  }, fireIndex);
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

test('War Room · canario visual de Hans físicamente en escena', async () => {
  // SwiftShader already produced the canonical PNG + health proof before the
  // previous 120 s ceiling, but browser/context teardown could overrun it.
  // Keep capture assertions strict and reserve a small cleanup margin.
  test.setTimeout(150_000);
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
    viewport: { width: 1440, height: 900 },
    hasTouch: false,
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
    await page.evaluate(() => {
      localStorage.setItem('chess-study-war-room-variant-v1', 'classic');
    });
    await seedGamesBeforeFire(page);

    await buttonWithVisibleText(page, 'Partida rápida').click();
    const quickDialog = page.getByRole('dialog', { name: 'Configurar partida rápida' });
    await expect(quickDialog).toBeVisible();
    await quickDialog.getByRole('button', { name: 'Empezar partida', exact: true }).click();
    const warRoom = page.locator('.board-live-row.is-3d-warroom');
    const canvas = page.locator('.board3d-main-canvas');
    const fireOverlay = page.getByTestId('warroom-hans-fire-call-overlay');
    const hansBubble = page.locator('.warroom-fire-call-bubble-hans');

    // Observe the transient Hans phase from the start instead of waiting for
    // every readiness marker serially and checking the phase after it vanished.
    // These conditions describe one concurrent scene transition, so waiting in
    // parallel keeps the 120 s canary budget meaningful on software WebGL.
    await Promise.all([
      expect(warRoom).toBeVisible({ timeout: 45_000 }),
      expect(canvas).toBeVisible({ timeout: 45_000 }),
      expect(canvas).toHaveAttribute('data-war-room-variant', 'classic', { timeout: 45_000 }),
      expect(canvas).toHaveAttribute('data-war-room-hans-scene-ready', 'true', { timeout: 60_000 }),
      expect(canvas).toHaveAttribute('data-war-room-hans-call-released', 'true', { timeout: 60_000 }),
      expect(canvas).toHaveAttribute('data-war-room-hans-reply-seen', 'true', { timeout: 75_000 }),
      expect(canvas).toHaveAttribute('data-war-room-hans-screen', /^(edge|onscreen)$/, { timeout: 60_000 }),
      expect(canvas).toHaveAttribute('data-war-room-hans-ground-gap', /.+/, { timeout: 60_000 }),
      expect(fireOverlay).toHaveAttribute('data-fire-call-phase', 'hans', { timeout: 75_000 }),
    ]);

    // Capture Hans himself, not a dialogue card covering his head and torso.
    // Copy/aria-label changes must not make this canary silently capture the
    // acknowledgement bubble again.
    await expect(fireOverlay).not.toHaveAttribute('data-fire-call-phase', 'hans', { timeout: 12_000 });
    await expect(hansBubble).toHaveCount(0, { timeout: 2_000 });
    await expect(canvas).toHaveAttribute('data-war-room-hans-screen', /^(edge|onscreen)$/, { timeout: 5_000 });
    await page.waitForTimeout(120);

    const replyBubbleVisible = await hansBubble.isVisible().catch(() => false);
    const fireCallPhase = await fireOverlay.getAttribute('data-fire-call-phase');
    const diagnostic = await canvas.evaluate((node, extra) => ({
      schema: 2,
      viewport: { width: window.innerWidth, height: window.innerHeight },
      screen: node.dataset.warRoomHansScreen || '',
      firstScreen: node.dataset.warRoomHansFirstScreen || '',
      ndcX: Number(node.dataset.warRoomHansNdcX),
      ndcY: Number(node.dataset.warRoomHansNdcY),
      groundGap: Number(node.dataset.warRoomHansGroundGap),
      groundSurface: node.dataset.warRoomHansGroundSurface || '',
      groundLock: node.dataset.warRoomHansGroundLock || '',
      sceneReady: node.dataset.warRoomHansSceneReady === 'true',
      callReleased: node.dataset.warRoomHansCallReleased === 'true',
      replySeen: node.dataset.warRoomHansReplySeen === 'true',
      replyBubbleVisible: extra.replyBubbleVisible,
      fireCallPhase: extra.fireCallPhase || '',
    }), { replyBubbleVisible, fireCallPhase });

    expect(diagnostic.sceneReady).toBe(true);
    expect(diagnostic.callReleased).toBe(true);
    expect(diagnostic.replySeen).toBe(true);
    expect(diagnostic.replyBubbleVisible).toBe(false);
    expect(diagnostic.fireCallPhase).not.toBe('hans');
    expect(diagnostic.screen).toMatch(/^(edge|onscreen)$/);
    expect(Number.isFinite(diagnostic.ndcX)).toBe(true);
    expect(Number.isFinite(diagnostic.ndcY)).toBe(true);
    expect(Math.abs(diagnostic.ndcX)).toBeLessThanOrEqual(1.05);
    expect(Math.abs(diagnostic.ndcY)).toBeLessThanOrEqual(1.05);
    expect(Number.isFinite(diagnostic.groundGap)).toBe(true);
    expect(diagnostic.groundGap).toBeLessThanOrEqual(MAX_GROUND_GAP);
    expect(diagnostic.groundSurface).toMatch(/^war-room-(command-carpet|castle-floor)/);
    expect(diagnostic.groundLock).toMatch(/^hans-visible-ground-lock-v/);

    await writeFile(
      `${ARTIFACT_DIR}/${LABEL}-health.json`,
      `${JSON.stringify(diagnostic, null, 2)}\n`,
      'utf8',
    );
    await captureViewportPng(context, page, `${ARTIFACT_DIR}/${LABEL}.png`);
  } finally {
    await context.close();
    await browser.close();
  }
});

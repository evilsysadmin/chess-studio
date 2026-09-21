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


async function closeWithDeadline(close, timeoutMs = 5_000) {
  await Promise.race([
    Promise.resolve().then(close).catch(() => null),
    new Promise((resolve) => setTimeout(resolve, timeoutMs)),
  ]);
}

test('War Room · canario visual de Hans físicamente en escena', async () => {
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
    await seedGamesBeforeFire(page);

    await buttonWithVisibleText(page, 'Partida rápida').click();
    await page.getByRole('button', { name: 'Empezar partida', exact: true }).click();
    await expect(page.locator('.board-live-row.is-3d-warroom')).toBeVisible({ timeout: 45_000 });

    const canvas = page.locator('.board3d-main-canvas');
    await expect(canvas).toBeVisible({ timeout: 45_000 });
    await expect(canvas).toHaveAttribute('data-war-room-hans-scene-ready', 'true', { timeout: 45_000 });
    await expect(canvas).toHaveAttribute('data-war-room-hans-call-released', 'true', { timeout: 12_000 });
    await expect(canvas).toHaveAttribute('data-war-room-hans-reply-seen', 'true', { timeout: 60_000 });
    await expect(canvas).toHaveAttribute('data-war-room-hans-screen', 'onscreen', { timeout: 20_000 });
    await expect(canvas).toHaveAttribute('data-war-room-hans-ground-gap', /.+/, { timeout: 20_000 });

    // Capture Hans himself, not a dialogue card covering his head and torso.
    // Observe the real narrative phase so copy/aria-label changes cannot make
    // this canary silently capture the acknowledgement bubble again.
    const fireOverlay = page.getByTestId('warroom-hans-fire-call-overlay');
    const hansBubble = page.locator('.warroom-fire-call-bubble-hans');
    await expect(fireOverlay).toHaveAttribute('data-fire-call-phase', 'hans', { timeout: 5_000 });
    await expect(fireOverlay).not.toHaveAttribute('data-fire-call-phase', 'hans', { timeout: 8_000 });
    await expect(hansBubble).toHaveCount(0, { timeout: 2_000 });
    await expect(canvas).toHaveAttribute('data-war-room-hans-screen', 'onscreen', { timeout: 5_000 });
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
    expect(diagnostic.screen).toBe('onscreen');
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
    // SwiftShader can occasionally finish the screenshot and then stall while
    // tearing down the GPU process. The artifact/diagnostics above are the
    // contract; do not let a stuck browser shutdown consume the whole test timeout.
    await closeWithDeadline(() => context.close());
    await closeWithDeadline(() => browser.close());
  }
});

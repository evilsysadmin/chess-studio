import { chromium, expect, test } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { activateSetupControl, buttonWithVisibleText, gameStatus, login, mockApi } from './helpers.js';
import { WAR_ROOM_HANS_CHORE_EVENTS } from '../frontend/src/components/WarRoomHansChoreContract.js';
import {
  WAR_ROOM_HANS_EVENTS,
  warRoomHansEventForGame,
} from '../frontend/src/components/WarRoomHansEventContract.js';

const ARTIFACT_DIR = '../.artifacts/app-visual/hans-routines';
const TEMP_VIDEO_DIR = '../.artifacts/hans-routine-video-tmp';
const VISIBLE_SCREEN = /^(?:onscreen|edge|offscreen)$/;
const MAX_GROUND_GAP = 0.02;
const SAMPLE_MS = 400;
const OBSERVE_MS = 6_000;
const SERVICE_EVENTS = new Set(['water-plant', 'espresso']);
const CHORE_EVENTS = new Set(WAR_ROOM_HANS_CHORE_EVENTS);
const REQUESTED_EVENTS = String(process.env.HANS_ROUTINE_EVENTS || '')
  .split(',')
  .map((eventName) => eventName.trim())
  .filter(Boolean);
const CAPTURE_EVENTS = REQUESTED_EVENTS.length ? REQUESTED_EVENTS : [...WAR_ROOM_HANS_EVENTS];

for (const eventName of CAPTURE_EVENTS) {
  if (!WAR_ROOM_HANS_EVENTS.includes(eventName)) {
    throw new Error(`Unknown Hans routine video event: ${eventName}`);
  }
}

// Each routine records a real SwiftShader/WebGL video. Running two of these
// browsers concurrently starves the software renderer and creates false 3 min
// timeouts, so keep this artifact producer deliberately sequential.
test.describe.configure({ mode: 'serial' });

function firstGameIndexForEvent(eventName) {
  for (let index = 1; index <= 96; index += 1) {
    if (warRoomHansEventForGame(`e2e-game-${index}`) === eventName) return index;
  }
  throw new Error(`Hans routine visual capture could not find ${eventName}`);
}

function expectedGameId(eventName) {
  return `e2e-game-${firstGameIndexForEvent(eventName)}`;
}

async function seedGamesBeforeEvent(page, eventName) {
  const targetIndex = firstGameIndexForEvent(eventName);
  if (targetIndex <= 1) return;
  await page.evaluate(async (count) => {
    for (let index = 1; index < count; index += 1) {
      await fetch('http://localhost:4000/api/games', {
        method: 'POST',
        mode: 'no-cors',
        headers: { 'Content-Type': 'text/plain' },
        body: '{}',
      });
    }
  }, targetIndex);
}

function expectedRoute(eventName) {
  if (eventName === 'mop') return 'mop-room';
  if (SERVICE_EVENTS.has(eventName)) return `service-${eventName}`;
  if (CHORE_EVENTS.has(eventName)) return `chore-${eventName}`;
  return '';
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

async function waitForRoutineStart(page, canvas, eventName) {
  if (eventName === 'fire') {
    await expect(canvas).toHaveAttribute('data-war-room-hans-scene-ready', 'true', { timeout: 45_000 });
    await expect(canvas).toHaveAttribute('data-war-room-hans-call-released', 'true', { timeout: 15_000 });
    await expect(canvas).toHaveAttribute('data-war-room-hans-reply-seen', 'true', { timeout: 60_000 });
    await expect(canvas).toHaveAttribute('data-war-room-hans-screen', VISIBLE_SCREEN, { timeout: 20_000 });
    return;
  }

  const route = expectedRoute(eventName);
  await expect.poll(
    () => page.evaluate((expected) => {
      const node = document.querySelector('.board3d-main-canvas');
      if (!node) return false;
      const screen = node.dataset.warRoomHansScreen || '';
      return node.dataset.warRoomHansRoute === expected
        && (screen === 'onscreen' || screen === 'edge' || screen === 'offscreen');
    }, route),
    { timeout: 75_000, intervals: [100, 100, 200, 300, 500] },
  ).toBe(true);
}

async function sampleRoutine(page, canvas, eventName) {
  const samples = [];
  const startedAt = Date.now();
  while (Date.now() - startedAt < OBSERVE_MS) {
    samples.push(await canvas.evaluate((node) => {
      const rawGroundGap = node.dataset.warRoomHansGroundGap;
      return {
        at: performance.now(),
        screen: node.dataset.warRoomHansScreen || '',
        route: node.dataset.warRoomHansRoute || '',
        choreographyPhase: node.dataset.warRoomHansChoreographyPhase || '',
        groundGap: rawGroundGap == null || rawGroundGap === '' ? null : Number(rawGroundGap),
        groundSurface: node.dataset.warRoomHansGroundSurface || '',
        serviceDialogue: node.dataset.warRoomHansServiceDialogue || '',
        mopDialogue: node.dataset.warRoomHansMopDialogue || '',
        ndcX: Number(node.dataset.warRoomHansNdcX),
        ndcY: Number(node.dataset.warRoomHansNdcY),
      };
    }));
    await page.waitForTimeout(SAMPLE_MS);
  }

  const finiteGround = samples
    .map((sample) => sample.groundGap)
    .filter(Number.isFinite);
  const visibleSamples = samples.filter((sample) => VISIBLE_SCREEN.test(sample.screen));
  const unique = (key) => [...new Set(samples.map((sample) => sample[key]).filter(Boolean))];
  const maxGroundGap = finiteGround.length ? Math.max(...finiteGround.map(Math.abs)) : null;

  expect(visibleSamples.length, `${eventName} should remain visually observable`).toBeGreaterThan(2);
  if (finiteGround.length) {
    expect(maxGroundGap, `${eventName} published grounding should remain locked`).toBeLessThanOrEqual(MAX_GROUND_GAP);
  }

  return {
    schema: 1,
    event: eventName,
    expectedGameId: expectedGameId(eventName),
    expectedRoute: expectedRoute(eventName),
    observedRoutes: unique('route'),
    observedScreens: unique('screen'),
    observedChoreographyPhases: unique('choreographyPhase'),
    observedServiceDialogue: unique('serviceDialogue'),
    observedMopDialogue: unique('mopDialogue'),
    groundTelemetryObserved: finiteGround.length > 0,
    finiteGroundSamples: finiteGround.length,
    maxGroundGap,
    sampleCount: samples.length,
  };
}

for (const eventName of CAPTURE_EVENTS) {
  test(`War Room · Hans routine video · ${eventName}`, async () => {
    test.setTimeout(240_000);
    await mkdir(ARTIFACT_DIR, { recursive: true });
    await mkdir(TEMP_VIDEO_DIR, { recursive: true });

    const emulateSupportedGpu = eventName !== 'fire';
    const browser = await chromium.launch({
      headless: true,
      args: [
        '--use-gl=angle',
        '--use-angle=swiftshader',
        '--enable-unsafe-swiftshader',
      ],
    });
    const context = await browser.newContext({
      viewport: { width: 1280, height: 720 },
      hasTouch: false,
      recordVideo: {
        dir: TEMP_VIDEO_DIR,
        size: { width: 640, height: 400 },
      },
    });
    await context.addInitScript(({ emulateGpu }) => {
      Object.defineProperty(navigator, 'hardwareConcurrency', {
        configurable: true,
        get: () => 8,
      });
      localStorage.setItem('chess-study-device-board-renderer-v1', '3d');
      localStorage.setItem('chess-study-reduced-motion', '0');
      localStorage.setItem('chess-study-war-room-variant-v1', 'classic');
      if (!emulateGpu) Math.random = () => 0.25;

      if (!emulateGpu) return;
      globalThis.__CHESS_E2E_HANS_AMBIENT_AUDIT__ = true;
      const rendererName = 'ANGLE (NVIDIA GeForce RTX 3060 Direct3D11)';
      for (const constructorName of ['WebGLRenderingContext', 'WebGL2RenderingContext']) {
        const prototype = globalThis[constructorName]?.prototype;
        const originalGetParameter = prototype?.getParameter;
        if (typeof originalGetParameter !== 'function') continue;
        Object.defineProperty(prototype, 'getParameter', {
          configurable: true,
          writable: true,
          value(parameter) {
            if (parameter === 0x9246 || parameter === 0x1F01) return rendererName;
            return originalGetParameter.call(this, parameter);
          },
        });
      }
    }, { emulateGpu: emulateSupportedGpu });

    const page = await context.newPage();
    const video = page.video();
    const videoPath = `${ARTIFACT_DIR}/${eventName}.webm`;
    try {
      await page.emulateMedia({ reducedMotion: 'no-preference' });
      await mockApi(page, {
        profileSeed: {
          'matthias.onboarded': '2',
          'chess-study-home-guide-dismissed-v1': '1',
        },
      });
      await login(page);
      await seedGamesBeforeEvent(page, eventName);

      // Home/Quick Match controls live inside animated 3D surfaces. These are
      // setup-only actions, so dispatch the click after visibility/enabled
      // checks instead of waiting for Playwright's visual-stability heuristic.
      await activateSetupControl(buttonWithVisibleText(page, 'Partida rápida'));
      const quickMatch = page.getByRole('dialog', { name: 'Configurar partida rápida' });
      await expect(quickMatch).toBeVisible({ timeout: 30_000 });
      await activateSetupControl(
        quickMatch.getByRole('button', { name: 'Empezar partida', exact: true }),
      );
      // Prove the game launch first; then budget the software-WebGL mount from
      // measured healthy desktop captures instead of conflating both phases.
      await expect(gameStatus(page)).toBeVisible({ timeout: 60_000 });
      await expect(page.locator('.board-live-row.is-3d-warroom')).toBeVisible({ timeout: 75_000 });

      const canvas = page.locator('.board3d-main-canvas');
      await expect(canvas).toBeVisible({ timeout: 75_000 });
      await expect(canvas).toHaveAttribute('data-war-room-variant', 'classic', { timeout: 30_000 });
      await expect(page.locator('[data-war-room-hans-game-id]').first()).toHaveAttribute(
        'data-war-room-hans-game-id',
        expectedGameId(eventName),
        { timeout: 10_000 },
      );
      await expect(canvas).toHaveAttribute(
        'data-board3d-renderer-class',
        emulateSupportedGpu ? 'NVIDIA' : 'SOFTWARE',
        { timeout: 10_000 },
      );
      await expect(canvas).toHaveAttribute(
        'data-board3d-scene-tier',
        emulateSupportedGpu ? 'full' : 'lite',
        { timeout: 10_000 },
      );
      await waitForRoutineStart(page, canvas, eventName);

      const manifest = await sampleRoutine(page, canvas, eventName);
      manifest.rendererClass = emulateSupportedGpu ? 'NVIDIA-emulated-on-SwiftShader' : 'SOFTWARE';
      manifest.sceneTier = emulateSupportedGpu ? 'full' : 'lite';
      await captureViewportPng(context, page, `${ARTIFACT_DIR}/${eventName}.png`);
      await writeFile(
        `${ARTIFACT_DIR}/${eventName}.json`,
        `${JSON.stringify(manifest, null, 2)}\n`,
        'utf8',
      );
    } finally {
      await page.close().catch(() => {});
      if (video) await video.saveAs(videoPath).catch(() => {});
      await context.close().catch(() => {});
      await browser.close().catch(() => {});
    }
  });
}

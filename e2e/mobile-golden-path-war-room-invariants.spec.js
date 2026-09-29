import { expect, test } from '@playwright/test';
import { APP_RELEASE } from '../frontend/src/release.js';
import { resolveBoard3DCameraFov } from '../frontend/src/components/Board3DConfig.js';
import { getWarRoomMobileFramingProfile } from '../frontend/src/components/WarRoomMobileFraming.js';
import { buttonWithVisibleText, login, mockApi } from './helpers.js';

const VIEWPORTS = [
  { width: 360, height: 640 },
  { width: 390, height: 844 },
  { width: 430, height: 932 },
];

const OTHER_TUTORIALS_SEEN = {
  'combat-basics': { seen: true },
  'combat-campaign': { seen: true },
  'combat-intelligence': { seen: true },
  'combat-deployment': { seen: true },
  'quick-match-rules': { seen: true },
  tournament: { seen: true },
  practice: { seen: true },
  puzzles: { seen: true },
  spectator: { seen: true },
  lab: { seen: true },
  'rival-ghost': { seen: true },
};

const PROFILES = [
  {
    id: 'new',
    profileSeed: {
      'chess-study-home-guide-dismissed-v1': '1',
      'chess-study-mechanic-tutorial-progress-v1': JSON.stringify(OTHER_TUTORIALS_SEEN),
    },
    expectTutorial: true,
  },
  {
    id: 'returning',
    profileSeed: {
      'chess-study-home-guide-dismissed-v1': '1',
      'chess-study-mechanic-tutorial-progress-v1': JSON.stringify({
        ...OTHER_TUTORIALS_SEEN,
        'war-room-basics': { seen: true },
      }),
    },
    expectTutorial: false,
  },
];

function normalized(vector) {
  const length = Math.hypot(...vector);
  return vector.map((value) => value / length);
}

function cross(a, b) {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
}

function dot(a, b) {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

function projectWarRoomPoint(rect, point) {
  const aspect = Math.max(0.35, rect.width / Math.max(1, rect.height));
  const profile = getWarRoomMobileFramingProfile({
    aspect,
    coarsePointer: true,
    viewportWidth: rect.width,
  });
  if (!profile) throw new Error('Mobile framing profile missing');
  const verticalFov = resolveBoard3DCameraFov(aspect, { mobile: true }) * Math.PI / 180;
  const limitingFov = Math.min(
    verticalFov,
    2 * Math.atan(Math.tan(verticalFov / 2) * aspect),
  );
  const distance = Math.max(
    profile.minDistance,
    Math.min(profile.maxDistance, (profile.halfSpan / Math.tan(limitingFov / 2)) * profile.padding),
  );
  const target = [0, profile.targetY, -profile.targetZ];
  const direction = normalized([0, profile.cameraY, profile.cameraZ]);
  const camera = target.map((value, index) => value + direction[index] * distance);
  const forward = normalized(target.map((value, index) => value - camera[index]));
  const right = normalized(cross(forward, [0, 1, 0]));
  const up = cross(right, forward);
  const relative = point.map((value, index) => value - camera[index]);
  const depth = dot(relative, forward);
  const ndcX = dot(relative, right) / (depth * Math.tan(verticalFov / 2) * aspect);
  const ndcY = dot(relative, up) / (depth * Math.tan(verticalFov / 2));
  return {
    x: rect.x + ((ndcX + 1) / 2) * rect.width,
    y: rect.y + ((1 - ndcY) / 2) * rect.height,
  };
}

function projectWarRoomSquare(rect, square, worldY = 0.12) {
  const fileIndex = square.charCodeAt(0) - 97;
  const rank = Number(square[1]);
  return projectWarRoomPoint(rect, [fileIndex - 3.5, worldY, 4.5 - rank]);
}

function projectedBoardRect(rect) {
  const corners = [
    [-4, 0.12, -4],
    [4, 0.12, -4],
    [-4, 0.12, 4],
    [4, 0.12, 4],
  ].map((point) => projectWarRoomPoint(rect, point));
  const xs = corners.map((point) => point.x);
  const ys = corners.map((point) => point.y);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return {
    x,
    y,
    width: Math.max(...xs) - x,
    height: Math.max(...ys) - y,
  };
}

function maxVerticalGap(boxes, viewportHeight) {
  const intervals = boxes
    .filter(Boolean)
    .map((box) => [Math.max(0, box.y), Math.min(viewportHeight, box.y + box.height)])
    .filter(([start, end]) => end > start)
    .sort((a, b) => a[0] - b[0]);
  let cursor = 0;
  let maxGap = 0;
  for (const [start, end] of intervals) {
    maxGap = Math.max(maxGap, start - cursor);
    cursor = Math.max(cursor, end);
  }
  return Math.max(maxGap, viewportHeight - cursor);
}

function intersects(a, b) {
  return a.x < b.x + b.width
    && a.x + a.width > b.x
    && a.y < b.y + b.height
    && a.y + a.height > b.y;
}

async function visibleBoxes(locator) {
  const count = await locator.count();
  const rows = [];
  for (let index = 0; index < count; index += 1) {
    const item = locator.nth(index);
    if (!await item.isVisible().catch(() => false)) continue;
    const box = await item.boundingBox();
    if (box) rows.push({ item, box });
  }
  return rows;
}

async function assertNoOverlap(aLocator, bLocator, label) {
  const [left, right] = await Promise.all([visibleBoxes(aLocator), visibleBoxes(bLocator)]);
  for (const a of left) {
    for (const b of right) {
      expect(intersects(a.box, b.box), label).toBe(false);
    }
  }
}

async function assertTargets(locator, label) {
  const rows = await visibleBoxes(locator);
  for (const { box } of rows) {
    expect(box.width, `${label}: target width`).toBeGreaterThanOrEqual(44);
    expect(box.height, `${label}: target height`).toBeGreaterThanOrEqual(44);
  }
  for (let i = 0; i < rows.length; i += 1) {
    for (let j = i + 1; j < rows.length; j += 1) {
      expect(intersects(rows[i].box, rows[j].box), `${label}: targets overlap`).toBe(false);
    }
  }
}

async function touch(cdp, point) {
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [{ x: point.x, y: point.y, radiusX: 4, radiusY: 4, force: 0.7, id: 1 }],
  });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
}

async function startMateGame(page, { profileSeed, releaseState }) {
  await page.addInitScript(() => { Math.random = () => 0; });
  await page.route(/\/release\.json(?:\?.*)?$/, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ release: releaseState.current }),
    });
  });
  await mockApi(page, { gameScenario: 'mate', profileSeed });
  await login(page);
  await buttonWithVisibleText(page, 'Partida rápida').click();
  const dialog = page.getByRole('dialog', { name: 'Configurar partida rápida' });
  await expect(dialog).toBeVisible();

  // Empty rating storage is the real 0/5 provisional state.
  expect(await page.evaluate(() => localStorage.getItem('chess-study-player-rating'))).toBeNull();

  await dialog.getByRole('button', { name: 'Empezar partida', exact: true }).click();
  const board = page.locator('[data-board3d-war-room="true"]');
  const canvas = page.locator('.board3d-main-canvas');
  await expect(board).toBeVisible({ timeout: 30_000 });
  await expect(canvas).toBeVisible({ timeout: 30_000 });
  return { board, canvas };
}

for (const viewport of VIEWPORTS) {
  for (const profile of PROFILES) {
    test(`mobile golden path · War Room invariants · ${profile.id} · ${viewport.width}x${viewport.height}`, async ({ page }, testInfo) => {
      test.setTimeout(120_000);
      await page.setViewportSize(viewport);
      const releaseState = { current: APP_RELEASE };
      const { board, canvas } = await startMateGame(page, { profileSeed: profile.profileSeed, releaseState });

      await page.screenshot({
        path: testInfo.outputPath(`after-${profile.id}-${viewport.width}x${viewport.height}.png`),
        fullPage: false,
        animations: 'disabled',
        caret: 'hide',
      });

      const rect = await canvas.boundingBox();
      expect(rect).not.toBeNull();
      const projectedBoard = projectedBoardRect(rect);
      expect(projectedBoard.width / viewport.width, 'rendered board must own >=88% viewport width').toBeGreaterThanOrEqual(.88);

      const hudControls = page.locator('.game-3d-turn-pill :is(button, summary[role="button"])');
      await assertTargets(hudControls, 'War Room HUD');
      const usefulControls = page.locator(
        '.game-3d-turn-pill, .masthead-game-compact :is(button, summary[role="button"]), .matthias-3d-opening-banter, .board3d-inspect',
      );
      const usefulBoxes = (await visibleBoxes(usefulControls)).map(({ box }) => box);
      const projectedWidthPct = (projectedBoard.width / viewport.width) * 100;
      const verticalGap = maxVerticalGap([projectedBoard, ...usefulBoxes], viewport.height);
      console.log('[mobile-golden-path-metrics]', JSON.stringify({
        profile: profile.id,
        viewport: `${viewport.width}x${viewport.height}`,
        projectedWidthPct: Number(projectedWidthPct.toFixed(2)),
        maxVerticalGapPx: Number(verticalGap.toFixed(2)),
        maxVerticalGapPct: Number(((verticalGap / viewport.height) * 100).toFixed(2)),
        projectedBoard,
        usefulBoxes,
      }));
      expect(
        verticalGap,
        'no vertical stripe >15% may be empty of board or useful UI',
      ).toBeLessThanOrEqual(viewport.height * .15);
      expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);

      const save = page.locator('.save-status-badge').filter({ hasText: 'Guardado' });
      await expect(save).toBeVisible();

      const matthias = profile.expectTutorial
        ? page.getByRole('region', { name: 'Tutorial de War Room con Matthias' })
        : page.getByRole('status', { name: 'Bravuconada de Matthias al iniciar la partida' });
      await expect(matthias).toBeVisible({ timeout: 10_000 });

      releaseState.current = 'v99.99-mobile-golden-path';
      await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
      const release = page.getByRole('status').filter({ hasText: 'Nueva versión disponible' });
      await expect(release).toBeVisible({ timeout: 5_000 });

      const overlays = page.locator('.save-status-badge, .release-update-notice, .matthias-3d-opening-banter');
      await assertNoOverlap(overlays, hudControls, 'overlay must not cover HUD controls');
      if (profile.expectTutorial) {
        const tutorialInteractive = matthias.locator('button');
        await assertNoOverlap(page.locator('.save-status-badge, .release-update-notice'), tutorialInteractive, 'system overlay must not cover tutorial action');
      }

      for (const text of [
        page.locator('.game-3d-turn-pill-label'),
        matthias.locator('p'),
        release.locator('.release-update-copy'),
      ]) {
        await expect(text).toBeVisible();
        const clipped = await text.evaluate((node) => node.scrollWidth > node.clientWidth + 1 || node.scrollHeight > node.clientHeight + 1);
        expect(clipped, 'key visible text must not be clipped').toBe(false);
      }

      const from = projectWarRoomSquare(rect, 'g6', .22);
      const to = projectWarRoomSquare(rect, 'g7', .12);
      const cdp = await page.context().newCDPSession(page);

      await touch(cdp, from);
      await expect(board).toHaveAttribute('data-board3d-selected', 'g6', { timeout: 3_000 });

      await touch(cdp, to);
      await expect(page.getByRole('heading', { name: /Jaque mate/i })).toBeVisible({ timeout: 15_000 });
    });
  }
}

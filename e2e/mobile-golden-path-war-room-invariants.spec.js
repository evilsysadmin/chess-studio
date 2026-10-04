import { expect, test } from '@playwright/test';
import { APP_RELEASE } from '../frontend/src/release.js';
import { buttonWithVisibleText, login, mockApi } from './helpers.js';
import { readBoard3DProjection } from './board3d-projection.js';

// Un teléfono real es táctil y `pointer: coarse`: sin esto la War Room aplica el
// encuadre de escritorio a una ventana estrecha y el test mide otra cámara.
test.use({ isMobile: true, hasTouch: true });

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

// Franja muerta = filas de píxeles casi negras y uniformes en la captura real.
// La sala renderizada alrededor del tablero es contenido; el vacío negro no.
async function maxDeadStripe(page) {
  const png = await page.screenshot({ animations: 'disabled', caret: 'hide' });
  return page.evaluate(async (base64) => {
    const image = new Image();
    image.src = `data:image/png;base64,${base64}`;
    await image.decode();
    const canvas = document.createElement('canvas');
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    context.drawImage(image, 0, 0);
    const { data, width, height } = context.getImageData(0, 0, canvas.width, canvas.height);
    let run = 0;
    let worst = 0;
    let worstEnd = 0;
    for (let y = 0; y < height; y += 1) {
      let sum = 0;
      let sumSq = 0;
      for (let x = 0; x < width; x += 1) {
        const i = (y * width + x) * 4;
        const luma = 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2];
        sum += luma;
        sumSq += luma * luma;
      }
      const mean = sum / width;
      const std = Math.sqrt(Math.max(0, sumSq / width - mean * mean));
      const dead = mean < 22 && std < 10;
      run = dead ? run + 1 : 0;
      if (run > worst) { worst = run; worstEnd = y; }
    }
    return { px: worst, from: worstEnd - worst + 1, to: worstEnd, height };
  }, png.toString('base64'));
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

async function assertInsideViewport(locator, viewport, label) {
  for (const { box } of await visibleBoxes(locator)) {
    expect(box.x, `${label}: inside viewport (left)`).toBeGreaterThanOrEqual(0);
    expect(box.y, `${label}: inside viewport (top)`).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width, `${label}: inside viewport (right)`).toBeLessThanOrEqual(viewport.width + 0.5);
    expect(box.y + box.height, `${label}: inside viewport (bottom)`).toBeLessThanOrEqual(viewport.height + 0.5);
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

async function startGame(page, { profileSeed, releaseState, gameScenario = 'mate' }) {
  await page.addInitScript(() => { Math.random = () => 0; });
  await page.route(/\/release\.json(?:\?.*)?$/, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ release: releaseState.current }),
    });
  });
  await mockApi(page, { gameScenario, profileSeed });
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
      const { board, canvas } = await startGame(page, { profileSeed: profile.profileSeed, releaseState });

      await page.screenshot({
        path: testInfo.outputPath(`after-${profile.id}-${viewport.width}x${viewport.height}.png`),
        fullPage: false,
        animations: 'disabled',
        caret: 'hide',
      });

      const projection = await readBoard3DProjection(canvas);
      const projectedBoard = projection.board;

      const hudControls = page.locator('.game-3d-turn-pill :is(button, summary[role="button"])');
      await assertTargets(hudControls, 'War Room HUD');
      const deadStripe = await maxDeadStripe(page);
      const projectedWidthPct = (projectedBoard.width / viewport.width) * 100;
      console.log('[mobile-golden-path-metrics]', JSON.stringify({
        profile: profile.id,
        viewport: `${viewport.width}x${viewport.height}`,
        projectedWidthPct: Number(projectedWidthPct.toFixed(2)),
        deadStripePct: Number(((deadStripe.px / deadStripe.height) * 100).toFixed(2)),
        deadStripe,
        projectedBoard,
      }));
      expect(projectedBoard.width / viewport.width, 'rendered board must own >=88% viewport width').toBeGreaterThanOrEqual(.88);
      expect(projectedBoard.x, 'all 64 squares on screen (left edge)').toBeGreaterThanOrEqual(0);
      expect(projectedBoard.x + projectedBoard.width, 'all 64 squares on screen (right edge)').toBeLessThanOrEqual(viewport.width);
      expect(projectedBoard.y, 'all 64 squares on screen (top edge)').toBeGreaterThanOrEqual(0);
      expect(projectedBoard.y + projectedBoard.height, 'all 64 squares on screen (bottom edge)').toBeLessThanOrEqual(viewport.height);
      expect(deadStripe.px, 'no near-black stripe >15% of the viewport height').toBeLessThanOrEqual(viewport.height * .15);
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
      await page.screenshot({
        path: testInfo.outputPath(`release-${profile.id}-${viewport.width}x${viewport.height}.png`),
        fullPage: false,
        animations: 'disabled',
        caret: 'hide',
      });

      const overlays = page.locator('.save-status-badge, .release-update-notice, .matthias-3d-opening-banter');
      await assertNoOverlap(overlays, hudControls, 'overlay must not cover HUD controls');
      await assertNoOverlap(page.locator('.save-status-badge'), page.locator('.game-3d-turn-pill'), 'save badge must not overlap the HUD pill');
      // The HUD pill is right-anchored and up to 360px wide: on narrow portraits
      // it used to cover most of the exit button.
      await assertNoOverlap(page.locator('.war-room-exit-overlay'), page.locator('.game-3d-turn-pill'), 'exit button must not hide under the HUD pill');
      await assertNoOverlap(page.locator('.war-room-exit-overlay'), page.locator('.save-status-badge'), 'exit button must not overlap the save status dot');
      await assertNoOverlap(release, matthias, 'release notice must not cover Matthias');
      await assertInsideViewport(matthias, viewport, 'Matthias bubble');
      await assertInsideViewport(release, viewport, 'release notice');
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

      // Tocamos la cabeza de la pieza (como un dedo real) y la casilla destino.
      const from = projection.square('g6', 0.6);
      const to = projection.square('g7');
      const cdp = await page.context().newCDPSession(page);

      await touch(cdp, from);
      await expect(board).toHaveAttribute('data-board3d-selected', 'g6', { timeout: 3_000 });
      if (profile.expectTutorial) {
        await expect(matthias).toHaveAttribute('data-tutorial-phase', 'move');
        await expect.poll(async () => Number(await board.getAttribute('data-board3d-legal-target-count'))).toBeGreaterThan(0);
      }

      await touch(cdp, to);
      await expect(page.getByRole('heading', { name: /Jaque mate/i })).toBeVisible({ timeout: 15_000 });
    });
  }
}


test('mobile golden path · la ayuda relanza el coaching interactivo de War Room', async ({ page }) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 390, height: 844 });
  const releaseState = { current: APP_RELEASE };
  const { board, canvas } = await startGame(page, {
    profileSeed: PROFILES[0].profileSeed,
    releaseState,
    gameScenario: 'opening',
  });

  const tutorial = page.getByRole('region', { name: 'Tutorial de War Room con Matthias' });
  await expect(tutorial).toBeVisible({ timeout: 10_000 });
  await expect(tutorial).toHaveAttribute('data-tutorial-phase', 'select');

  const projection = await readBoard3DProjection(canvas);
  const cdp = await page.context().newCDPSession(page);
  await touch(cdp, projection.square('e2', 0.6));
  await expect(board).toHaveAttribute('data-board3d-selected', 'e2', { timeout: 3_000 });
  await expect(tutorial).toHaveAttribute('data-tutorial-phase', 'move');
  await expect.poll(async () => Number(await board.getAttribute('data-board3d-legal-target-count'))).toBeGreaterThan(0);

  await touch(cdp, projection.square('e4'));
  await expect(tutorial).toHaveAttribute('data-tutorial-phase', 'complete', { timeout: 15_000 });
  await tutorial.getByRole('button', { name: 'Continuar', exact: true }).click();
  await expect(tutorial).toBeHidden();

  const help = page.getByRole('button', { name: 'Abrir guía de la War Room', exact: true });
  await help.click();
  const reference = page.getByRole('dialog', { name: 'Tutorial: Tu puesto de mando' });
  await expect(reference).toBeVisible();
  await reference.getByRole('button', { name: 'Cerrar tutorial', exact: true }).click();

  await expect(tutorial).toBeVisible({ timeout: 5_000 });
  await expect(tutorial).toHaveAttribute('data-tutorial-phase', 'select');
  await expect(board).toHaveAttribute('data-board3d-selected', '');
});



test('mobile golden path · zoom de dos dedos amplía, sigue jugable y se restaura', async ({ page }, testInfo) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 390, height: 844 });
  const releaseState = { current: APP_RELEASE };
  const { board, canvas } = await startGame(page, {
    profileSeed: PROFILES[0].profileSeed,
    releaseState,
    gameScenario: 'opening',
  });
  const zoomRoot = page.locator('.war-room-board-zoom');
  const restore = page.getByRole('button', { name: 'Restaurar vista', exact: true });
  await expect(zoomRoot).toHaveAttribute('data-war-room-zoom', '1.00');
  await expect(restore).toHaveCount(0);

  // Two fingers spread around e2: zoom anchored on the gesture, no move played.
  const before = await readBoard3DProjection(canvas);
  const center = before.square('e2');
  const cdp = await page.context().newCDPSession(page);
  const finger = (id, x, y) => ({ x, y, radiusX: 4, radiusY: 4, force: 0.7, id });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [finger(1, center.x - 30, center.y), finger(2, center.x + 30, center.y)] });
  for (let step = 1; step <= 6; step += 1) {
    const spread = 30 + step * 12;
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [finger(1, center.x - spread, center.y), finger(2, center.x + spread, center.y)] });
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await expect.poll(async () => Number(await zoomRoot.getAttribute('data-war-room-zoom'))).toBeGreaterThan(1.8);
  await expect(restore).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('war-room-pinch-zoomed-390x844.png'), animations: 'disabled', caret: 'hide' });

  // The magnified board still plays with one finger, on the square under it,
  // and the zoom stayed anchored where the fingers were.
  const zoomed = await readBoard3DProjection(canvas);
  expect(Math.abs(zoomed.square('e2').x - center.x)).toBeLessThan(40);
  // The first finger of the pinch may have selected the piece under it; a
  // one-finger tap on another piece must select exactly that one.
  const target = (await board.getAttribute('data-board3d-selected')) === 'e2' ? 'd2' : 'e2';
  await touch(cdp, zoomed.square(target, 0.6));
  await expect(board).toHaveAttribute('data-board3d-selected', target, { timeout: 3_000 });

  await restore.click();
  await expect(zoomRoot).toHaveAttribute('data-war-room-zoom', '1.00');
  await expect(restore).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Inspeccionar', exact: true })).toHaveCount(0);
});

test('mobile golden path · release compacta en apaisado 844x390', async ({ page }, testInfo) => {
  test.setTimeout(120_000);
  const viewport = { width: 844, height: 390 };
  await page.setViewportSize(viewport);
  const releaseState = { current: APP_RELEASE };
  const { canvas } = await startGame(page, {
    profileSeed: PROFILES[1].profileSeed,
    releaseState,
  });

  const projection = await readBoard3DProjection(canvas);
  const hud = page.locator('.game-3d-turn-pill');
  await expect(hud).toBeVisible();
  const hudBox = await hud.boundingBox();
  expect(hudBox).not.toBeNull();

  releaseState.current = 'v99.99-mobile-landscape';
  await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
  const release = page.getByRole('status').filter({ hasText: 'Nueva versión disponible' });
  await expect(release).toBeVisible({ timeout: 5_000 });

  await page.screenshot({
    path: testInfo.outputPath('release-returning-844x390.png'),
    fullPage: false,
    animations: 'disabled',
    caret: 'hide',
  });

  const releaseBox = await release.boundingBox();
  expect(releaseBox).not.toBeNull();
  expect(releaseBox.x).toBeGreaterThanOrEqual(0);
  expect(releaseBox.y).toBeGreaterThanOrEqual(0);
  expect(releaseBox.x + releaseBox.width).toBeLessThanOrEqual(viewport.width + .5);
  expect(releaseBox.y + releaseBox.height).toBeLessThanOrEqual(viewport.height + .5);
  expect(releaseBox.height, 'release must stay pill-sized in short landscape').toBeLessThanOrEqual(56);
  expect(intersects(releaseBox, hudBox), 'release must not cover HUD').toBe(false);
  expect(intersects(releaseBox, projection.board), 'release must not cover rendered board').toBe(false);

  const copy = release.locator('.release-update-copy');
  const clipped = await copy.evaluate((node) => node.scrollWidth > node.clientWidth + 1 || node.scrollHeight > node.clientHeight + 1);
  expect(clipped, 'release copy must not clip').toBe(false);
});



async function captureWarRoomFrame(page, path) {
  const staged = await page.evaluate(() => {
    const canvases = [...document.querySelectorAll('canvas.board3d-main-canvas')];
    return canvases.map((canvas, index) => {
      const rect = canvas.getBoundingClientRect();
      const shell = canvas.closest('.board3d-main-shell');
      const shellRect = shell?.getBoundingClientRect();
      const image = document.createElement('img');
      image.src = canvas.toDataURL('image/png');
      image.alt = '';
      image.dataset.combatWarRoomCapture = String(index);
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
      return image.dataset.combatWarRoomCapture;
    });
  });

  if (staged.length) {
    await page.waitForFunction(() => [...document.querySelectorAll('img[data-combat-war-room-capture]')]
      .every((image) => image.complete && image.naturalWidth > 0));
  }

  try {
    const png = await page.screenshot({ fullPage: false, animations: 'disabled', caret: 'hide' });
    await writeFile(path, png);
  } finally {
    await page.evaluate(() => {
      document.querySelectorAll('img[data-combat-war-room-capture]').forEach((image) => image.remove());
    });
  }
}
import { expect, test } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import {
  dismissTutorialIfVisible,
  login,
  mockApi,
  openCampaignBriefing,
  seedCombatBattleSnapshot,
  clickBoardMove,
} from './helpers.js';

const ARTIFACT_DIR = '../.artifacts/app-visual/combat-battle';
const WAR_ROOM_VARIANT_STORAGE_KEY = 'chess-study-war-room-variant-v1';

async function pinCanonicalBattleWarRoom(page) {
  await page.addInitScript(({ key }) => {
    window.localStorage.setItem(key, 'v3');
  }, { key: WAR_ROOM_VARIANT_STORAGE_KEY });
}

async function openCombatBattle(page) {
  await pinCanonicalBattleWarRoom(page);
  await mockApi(page);
  await login(page);
  await openCampaignBriefing(page);
  await page.getByRole('button', { name: /PREPARAR EJÉRCITO/i }).click();
  await dismissTutorialIfVisible(page);

  const quick = page.getByRole('button', { name: /¡ENTRAR EN COMBATE!|ORGANIZAR Y COMBATIR/i });
  await expect(quick).toBeVisible();
  await quick.click();

  const battle = page.locator('[data-combat-war-room="generic"]');
  await expect(battle).toBeVisible({ timeout: 45_000 });
  const board3d = battle.locator('[data-board3d-war-room="true"]');
  await expect(board3d).toBeVisible({ timeout: 45_000 });
  await expect(board3d).toHaveAttribute('data-board3d-variant', 'v3');
  await expect(board3d).toHaveAttribute('data-board3d-variant-status', 'ready', { timeout: 45_000 });
  await expect(battle.locator('.board3d-main-canvas')).toBeVisible({ timeout: 45_000 });
  return battle;
}

async function battleHealth(page) {
  return page.evaluate(() => {
    const rect = (selector) => {
      const node = document.querySelector(selector);
      if (!node) return null;
      const box = node.getBoundingClientRect();
      return {
        left: Number(box.left.toFixed(1)),
        top: Number(box.top.toFixed(1)),
        right: Number(box.right.toFixed(1)),
        bottom: Number(box.bottom.toFixed(1)),
        width: Number(box.width.toFixed(1)),
        height: Number(box.height.toFixed(1)),
      };
    };
    return {
      horizontalOverflow: document.documentElement.scrollWidth > window.innerWidth + 1,
      canvas: rect('[data-combat-war-room="generic"] .board3d-main-canvas'),
      status: rect('.combat-warroom-status'),
      log: rect('.combat-warroom-ops'),
      controls: rect('.combat-warroom-controls'),
      landscapeGate: rect('.war-room-landscape-gate'),
    };
  });
}

test('Combat battle · desktop lives inside the generic War Room', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openCombatBattle(page);
  const health = await battleHealth(page);

  expect(health.horizontalOverflow).toBe(false);
  expect(health.canvas?.width || 0).toBeGreaterThan(900);
  expect(health.canvas?.height || 0).toBeGreaterThan(650);
  expect(health.log?.right || 9999).toBeLessThanOrEqual(1441);
  expect(health.controls?.bottom || 9999).toBeLessThanOrEqual(901);
  const toggleHistory = page.getByRole('button', { name: /Registro de batalla/ });
  await expect(toggleHistory).toBeVisible();
  await expect(toggleHistory).toHaveAttribute('aria-expanded', 'false');
  await toggleHistory.click();
  await expect(toggleHistory).toHaveAttribute('aria-expanded', 'true');
  const historyBody = page.getByRole('region', { name: 'Historial de la batalla' });
  await expect(historyBody).toBeVisible();
  await expect(historyBody).toBeInViewport({ ratio: 0.7 });
  const historyBounds = await historyBody.boundingBox();
  expect(historyBounds?.height || 0, 'Expanded history must occupy visible space').toBeGreaterThan(65);
  await mkdir(ARTIFACT_DIR, { recursive: true });
  await captureWarRoomFrame(page, ARTIFACT_DIR + '/combat-battle-history-open-desktop-1440x900.png');
  await toggleHistory.click();
  await expect(toggleHistory).toHaveAttribute('aria-expanded', 'false');
  const exit = page.getByRole('button', { name: 'Salir', exact: true });
  await expect(exit).toBeVisible();
  await exit.click();
  const exitDialog = page.getByRole('dialog', { name: '¿Qué quieres hacer?' });
  await expect(exitDialog).toBeVisible();
  await expect(exitDialog.getByRole('button', { name: 'Salir al castillo', exact: true })).toBeVisible();
  await expect(exitDialog.getByRole('button', { name: 'Abandonar partida y asumir bajas', exact: true })).toBeVisible();

  await mkdir(ARTIFACT_DIR, { recursive: true });
  await captureWarRoomFrame(page, ARTIFACT_DIR + '/combat-battle-desktop-1440x900.png');
});

test.describe('Combat battle · Android', () => {
  test.use({ hasTouch: true, isMobile: true });

  test('portrait keeps a usable War Room and offers landscape', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await openCombatBattle(page);
    const health = await battleHealth(page);

    expect(health.horizontalOverflow).toBe(false);
    expect(health.canvas?.width || 0).toBeGreaterThanOrEqual(388);
    expect(health.canvas?.height || 0).toBeGreaterThan(700);
    await expect(page.getByRole('button', { name: 'Activar apaisado' })).toBeVisible();
    const exit = page.getByRole('button', { name: 'Salir', exact: true });
    await expect(exit).toBeVisible();
    await exit.click();
    const exitDialog = page.getByRole('dialog', { name: '¿Qué quieres hacer?' });
    await expect(exitDialog).toBeVisible();
    await expect(exitDialog.getByRole('button', { name: 'Salir al castillo', exact: true })).toBeVisible();
    await expect(exitDialog.getByRole('button', { name: 'Abandonar partida y asumir bajas', exact: true })).toBeVisible();

    const targets = page.locator('.combat-battle-screen button:visible, .combat-battle-screen summary:visible');
    const count = await targets.count();
    for (let index = 0; index < count; index += 1) {
      const box = await targets.nth(index).boundingBox();
      if (!box) continue;
      expect(Math.min(box.width, box.height), 'Combat battle touch target >=44px').toBeGreaterThanOrEqual(44);
    }

    await mkdir(ARTIFACT_DIR, { recursive: true });
    await captureWarRoomFrame(page, ARTIFACT_DIR + '/combat-battle-android-390x844.png');
  });

  test('landscape keeps battle chrome away from the board edges', async ({ page }) => {
    await page.setViewportSize({ width: 844, height: 390 });
    await openCombatBattle(page);
    const health = await battleHealth(page);

    expect(health.horizontalOverflow).toBe(false);
    expect(health.canvas?.width || 0).toBeGreaterThan(700);
    expect(health.canvas?.height || 0).toBeGreaterThan(360);
    expect(health.log?.right || 9999).toBeLessThanOrEqual(845);
    expect(health.controls?.left ?? -1).toBeGreaterThanOrEqual(-1);
      const toggleHistory = page.getByRole('button', { name: /Registro de batalla/ });
    await expect(toggleHistory).toBeVisible();
    await toggleHistory.click();
    await expect(toggleHistory).toHaveAttribute('aria-expanded', 'true');
    const historyBody = page.getByRole('region', { name: 'Historial de la batalla' });
    await expect(historyBody).toBeVisible();
    await expect(historyBody).toBeInViewport({ ratio: 0.7 });
    const historyBounds = await historyBody.boundingBox();
    expect(historyBounds?.height || 0, 'Landscape history must unfold visibly').toBeGreaterThan(65);
    await mkdir(ARTIFACT_DIR, { recursive: true });
    await captureWarRoomFrame(page, ARTIFACT_DIR + '/combat-battle-history-open-landscape-844x390.png');
    await toggleHistory.click();
    await expect(toggleHistory).toHaveAttribute('aria-expanded', 'false');
  const exit = page.getByRole('button', { name: 'Salir', exact: true });
    await expect(exit).toBeVisible();
    await exit.click();
    const exitDialog = page.getByRole('dialog', { name: '¿Qué quieres hacer?' });
    await expect(exitDialog).toBeVisible();
    await expect(exitDialog.getByRole('button', { name: 'Salir al castillo', exact: true })).toBeVisible();
    await expect(exitDialog.getByRole('button', { name: 'Abandonar partida y asumir bajas', exact: true })).toBeVisible();

    await mkdir(ARTIFACT_DIR, { recursive: true });
    await captureWarRoomFrame(page, ARTIFACT_DIR + '/combat-battle-android-landscape-844x390.png');
  });
});

const MATE_CAPTURE_FEN = '7k/8/5KQ1/8/8/8/8/8 w - - 0 1';

async function openRealCampaignMate(page) {
  await openCombatBattle(page);
  const sessionId = await page.evaluate(() => {
    const campaign = JSON.parse(localStorage.getItem('chess-study-combat-campaign-v1') || '{}');
    return `campaign:${campaign.seed}:${campaign.selectedNodeId}`;
  });
  expect(sessionId).toMatch(/^campaign:.+:.+$/);
  await seedCombatBattleSnapshot(page, { sessionId, fen: MATE_CAPTURE_FEN });
  await page.reload();
  const board = page.locator('[data-combat-war-room="generic"] [data-board3d-war-room="true"]');
  await expect(board).toBeVisible({ timeout: 45_000 });
  await clickBoardMove(page, 'g6', 'g7');
  const reveal = page.getByRole('region', { name: 'Resultado de la batalla' });
  await expect(reveal.getByRole('heading', { name: 'JAQUE MATE' })).toBeVisible({ timeout: 25_000 });
  await expect(board).toBeVisible();
  return reveal;
}

async function expectMateRevealLeavesBoardCenterClear(page, reveal) {
  const bounds = await reveal.boundingBox();
  const viewport = page.viewportSize();
  expect(bounds).not.toBeNull();
  expect(viewport).not.toBeNull();
  // The results card should sit in the side scenery, not cover the mating pieces.
  expect(bounds.x + bounds.width).toBeLessThan(viewport.width * .36);
  expect(bounds.y).toBeGreaterThan(40);
}

test('Combat mate · 1440x900 keeps the War Room until the debrief CTA', async ({ page }) => {
  test.setTimeout(100_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  const reveal = await openRealCampaignMate(page);
  await expectMateRevealLeavesBoardCenterClear(page, reveal);
  await mkdir(ARTIFACT_DIR, { recursive: true });
  await captureWarRoomFrame(page, ARTIFACT_DIR + '/combat-checkmate-desktop-1440x900.png');
  await reveal.getByRole('button', { name: /Ver debriefing/ }).click();
  const debrief = page.getByRole('region', { name: 'Informe postcombate' });
  await expect(debrief).toBeVisible({ timeout: 20_000 });
  await expect(debrief.getByRole('heading', { name: 'VICTORIA' })).toBeVisible();
  await expect(debrief.locator('.combat-debrief-score-details')).not.toHaveAttribute('open');
  await debrief.scrollIntoViewIfNeeded();
  await captureWarRoomFrame(page, ARTIFACT_DIR + '/combat-debrief-story-desktop-1440x900.png');
});

test('Combat mate · landscape 844x390 and portrait debrief 390x844', async ({ page }) => {
  test.setTimeout(100_000);
  await page.setViewportSize({ width: 844, height: 390 });
  const reveal = await openRealCampaignMate(page);
  await expectMateRevealLeavesBoardCenterClear(page, reveal);
  await mkdir(ARTIFACT_DIR, { recursive: true });
  await captureWarRoomFrame(page, ARTIFACT_DIR + '/combat-checkmate-landscape-844x390.png');
  await reveal.getByRole('button', { name: /Ver debriefing/ }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  const debrief = page.getByRole('region', { name: 'Informe postcombate' });
  await expect(debrief).toBeVisible({ timeout: 20_000 });
  await expect(debrief.getByRole('heading', { name: 'VICTORIA' })).toBeVisible();
  await expect(debrief.locator('.combat-debrief-score-details')).not.toHaveAttribute('open');
  // The global player remains available but must not sit on the campaign title.
  const dock = page.locator('.global-music-dock');
  const heading = page.getByRole('heading', { name: 'Campaña de Combat Chess' });
  await expect(dock).toBeVisible();
  await expect(heading).toBeVisible();
  const dockBounds = await dock.boundingBox();
  const headingBounds = await heading.boundingBox();
  expect(dockBounds).not.toBeNull();
  expect(headingBounds).not.toBeNull();
  expect(dockBounds.y + dockBounds.height, 'Music dock must finish before the campaign heading').toBeLessThanOrEqual(headingBounds.y + 1);
  await debrief.scrollIntoViewIfNeeded();
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)).toBe(false);
  await captureWarRoomFrame(page, ARTIFACT_DIR + '/combat-debrief-story-portrait-390x844.png');
});


test('Torre · F5 revela informe postcombate en escritorio y móvil', async ({ page }) => {
  test.setTimeout(130_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await mockApi(page);
  await login(page);
  const entry = page.getByRole('button').filter({ has: page.getByText('Combat Chess · Campaña', { exact: true }) });
  await expect(entry).toBeVisible();
  await entry.click();
  await page.evaluate(() => localStorage.setItem('chess-study-roguelike-run', JSON.stringify({
    floor: 1, inRun: true, phase: 'battle', seed: 'tower-f5-visual', mode: 'tower', perks: [],
    rewardChosenForFloor: null,
  })));
  await page.reload();
  await page.getByRole('button', { name: /PREPARAR EJÉRCITO/i }).click();
  const start = page.getByRole('button', { name: /¡ENTRAR EN COMBATE!|ORGANIZAR Y COMBATIR/i });
  await expect(start).toBeVisible();
  await start.click();
  await expect(page.locator('.combat-battle-screen')).toBeVisible({ timeout: 45_000 });
  await seedCombatBattleSnapshot(page, { sessionId: 'run:tower-f5-visual:1', fen: MATE_CAPTURE_FEN });
  await page.reload();
  await expect(page.locator('[data-combat-war-room="generic"] [data-board3d-war-room="true"]')).toBeVisible({ timeout: 45_000 });
  await clickBoardMove(page, 'g6', 'g7');
  const reveal = page.getByRole('region', { name: 'Resultado de la batalla' });
  await expect(reveal.getByRole('heading', { name: 'JAQUE MATE' })).toBeVisible({ timeout: 20_000 });
  await page.reload();
  const report = page.getByRole('region', { name: 'Informe postcombate' });
  await expect(report.getByRole('heading', { name: 'VICTORIA' })).toBeVisible({ timeout: 45_000 });
  await expect(page.getByRole('heading', { name: /Piso 1 superado/ })).toBeVisible();
  await report.scrollIntoViewIfNeeded();
  await mkdir(ARTIFACT_DIR, { recursive: true });
  await captureWarRoomFrame(page, ARTIFACT_DIR + '/combat-tower-f5-desktop-1440x900.png');
  await page.setViewportSize({ width: 390, height: 844 });
  await report.scrollIntoViewIfNeeded();
  await expect(report).toBeInViewport({ ratio: 0.5 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)).toBe(false);
  await captureWarRoomFrame(page, ARTIFACT_DIR + '/combat-tower-f5-mobile-390x844.png');
});
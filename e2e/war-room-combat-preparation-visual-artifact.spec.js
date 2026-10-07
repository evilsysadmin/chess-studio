

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
import { createHash } from 'node:crypto';
import {
  dismissTutorialIfVisible,
  login,
  mockApi,
  openCampaignBriefing,
} from './helpers.js';

const ARTIFACT_DIR = '../.artifacts/app-visual/combat-preparation';
const COMBAT_OPERATIONS_RUNTIME_URL =
  'https://assets.chess-studio.shadowops.dpdns.org/combat/operations-room/runtime/combat-operations-room-shell-7d248a340d8153ed.glb';
const COMBAT_OPERATIONS_RUNTIME_SHA256 =
  '7d248a340d8153ed0da1152e1a56ee745615e37e5f032de28d9b5096815f20bc';
const COMBAT_OPERATIONS_RUNTIME_BYTES = 2476092;

async function verifyCombatOperationsRuntimeAsset(page) {
  const response = await page.request.get(COMBAT_OPERATIONS_RUNTIME_URL + '?probe=' + Date.now(), {
    headers: { 'cache-control': 'no-cache' },
    timeout: 20_000,
  });
  expect(response.ok(), 'Combat Operations Room immutable R2 object is public').toBe(true);
  const body = await response.body();
  expect(body.byteLength).toBe(COMBAT_OPERATIONS_RUNTIME_BYTES);
  expect(createHash('sha256').update(body).digest('hex')).toBe(COMBAT_OPERATIONS_RUNTIME_SHA256);
}

async function openOperationsRoom(page) {
  await verifyCombatOperationsRuntimeAsset(page);
  await mockApi(page);
  await login(page);
  await openCampaignBriefing(page);
  await page.getByRole('button', { name: /PREPARAR EJÉRCITO/i }).click();
  await dismissTutorialIfVisible(page);

  const room = page.locator('[data-combat-preparation-room="combat-operations-room"]');
  await expect(room).toBeVisible({ timeout: 45_000 });
  const board3d = room.locator('[data-board3d-war-room="true"]');
  await expect(board3d).toBeVisible({ timeout: 45_000 });
  await expect(board3d).toHaveAttribute('data-board3d-variant', 'combat-ops');
  await expect(board3d).toHaveAttribute('data-board3d-variant-status', 'ready', { timeout: 45_000 });
  await expect(room.locator('.board3d-main-canvas')).toBeVisible({ timeout: 45_000 });
  await expect(page.getByLabel('Resumen de preparación')).toBeVisible();
  await expect(page.getByRole('button', { name: /Personalizar despliegue/i })).toBeVisible();
  return room;
}

async function openWarTable(page) {
  await openOperationsRoom(page);
  await page.getByRole('button', { name: /Personalizar despliegue/i }).click();
  const table = page.locator('[data-combat-deployment="war-table"]');
  await expect(table).toBeVisible();
  await expect(table.getByRole('heading', { name: 'Mesa de Guerra', exact: true })).toBeVisible();
  return table;
}

async function openBarracks(page) {
  await openOperationsRoom(page);
  const logistics = page.locator('.combat-operations-drawer');
  await logistics.locator('summary').click();
  await page.getByRole('button', { name: /Ejército y veteranos/i }).click();

  const barracks = page.locator('[data-combat-barracks="room"]');
  await expect(barracks).toBeVisible();
  await expect(barracks.getByRole('heading', { name: 'Tu ejército' })).toBeVisible();
  return barracks;
}

async function barracksHealth(page) {
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
      screen: rect('[data-combat-barracks="room"]'),
      shell: rect('.combat-barracks-shell'),
      firstUnit: rect('.combat-barracks-shell .army-unit-tile'),
      unitCount: document.querySelectorAll('.combat-barracks-shell .army-unit-tile').length,
      dossier: rect('.combat-barracks-screen .army-unit-detail'),
      operationsCanvasVisible: Boolean(document.querySelector('.combat-preparation-room-stage .board3d-main-canvas')?.getClientRects().length),
      prepChromeVisible: [...document.querySelectorAll('.combat-operations-shell > :not(.combat-preparation-room-stage)')]
        .some((node) => node.getClientRects().length && getComputedStyle(node).visibility !== 'hidden'),
    };
  });
}

async function deploymentHealth(page) {
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
      shell: rect('[data-combat-deployment="war-table"]'),
      board: rect('[data-combat-deployment="war-table"] .deployment-board-zone .board-wrap')
        || rect('[data-combat-deployment="war-table"] .deployment-board-zone .board3d-main-shell'),
      reserve: rect('[data-combat-deployment="war-table"] .deployment-reserve-panel'),
      footer: rect('[data-combat-deployment="war-table"] .combat-deployment-footer'),
      mastheadVisible: Boolean(document.querySelector('.masthead')?.getClientRects().length),
      globalMusicVisible: Boolean(document.querySelector('.global-music-dock')?.getClientRects().length),
    };
  });
}

async function health(page) {
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
      shell: rect('.combat-operations-shell'),
      stage: rect('.combat-preparation-room-stage'),
      canvas: rect('.combat-preparation-room-stage .board3d-main-canvas'),
      briefing: rect('.combat-operations-briefing'),
      primary: rect('.combat-operations-primary'),
      drawer: rect('.combat-operations-drawer'),
      mastheadVisible: Boolean(document.querySelector('.masthead')?.getClientRects().length),
      globalMusicVisible: Boolean(document.querySelector('.global-music-dock')?.getClientRects().length),
    };
  });
}

test('Combat preparation · desktop is a board-first operations room', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openOperationsRoom(page);

  const snapshot = await health(page);
  expect(snapshot.horizontalOverflow).toBe(false);
  expect(snapshot.shell?.top ?? 9999).toBeLessThanOrEqual(1);
  expect(snapshot.shell?.bottom || 0).toBeGreaterThanOrEqual(899);
  expect(snapshot.shell?.height || 0).toBeGreaterThanOrEqual(898);
  expect(snapshot.mastheadVisible).toBe(false);
  expect(snapshot.globalMusicVisible).toBe(false);
  expect(snapshot.canvas?.width || 0).toBeGreaterThan(900);
  expect(snapshot.canvas?.height || 0).toBeGreaterThan(600);
  expect(snapshot.primary?.bottom || 9999).toBeLessThanOrEqual((snapshot.shell?.bottom || 0) + 1);
  expect(snapshot.drawer?.bottom || 9999).toBeLessThanOrEqual((snapshot.shell?.bottom || 0) + 1);

  await mkdir(ARTIFACT_DIR, { recursive: true });
  await captureWarRoomFrame(page, ARTIFACT_DIR + '/combat-preparation-desktop-1440x900.png');
});

test('Combat deployment · desktop is a diegetic War Table over the Operations Room', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openWarTable(page);

  const snapshot = await deploymentHealth(page);
  expect(snapshot.horizontalOverflow).toBe(false);
  expect(snapshot.shell?.width || 0).toBeGreaterThanOrEqual(1438);
  expect(snapshot.shell?.height || 0).toBeGreaterThanOrEqual(898);
  expect(snapshot.board?.width || 0).toBeGreaterThan(500);
  expect(snapshot.reserve?.left || -1).toBeGreaterThanOrEqual(-1);
  expect(snapshot.footer?.bottom || 9999).toBeLessThanOrEqual(901);

  await mkdir(ARTIFACT_DIR, { recursive: true });
  await captureWarRoomFrame(page, ARTIFACT_DIR + '/combat-deployment-war-table-desktop-1440x900.png');
});

test('Combat barracks · desktop reads as a veteran roster inside the Operations Room', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const barracks = await openBarracks(page);

  const snapshot = await barracksHealth(page);
  expect(snapshot.horizontalOverflow).toBe(false);
  expect(snapshot.screen?.width || 0).toBeGreaterThanOrEqual(1438);
  expect(snapshot.screen?.height || 0).toBeGreaterThanOrEqual(898);
  expect(snapshot.shell?.width || 0).toBeGreaterThan(1100);
  expect(snapshot.unitCount).toBeGreaterThanOrEqual(16);
  expect(snapshot.firstUnit?.width || 0).toBeGreaterThan(100);
  expect(snapshot.operationsCanvasVisible).toBe(true);
  expect(snapshot.prepChromeVisible).toBe(false);

  await mkdir(ARTIFACT_DIR, { recursive: true });
  await captureWarRoomFrame(page, ARTIFACT_DIR + '/combat-barracks-desktop-1440x900.png');

  await barracks.locator('.army-unit-tile').nth(1).click();
  await expect(page.locator('.combat-barracks-screen .army-unit-detail')).toBeVisible();
  const dossier = await barracksHealth(page);
  expect(Math.abs((dossier.dossier?.right || 0) - (dossier.shell?.right || 0))).toBeLessThanOrEqual(1);
  expect(dossier.dossier?.width || 0).toBeGreaterThan(480);
  await captureWarRoomFrame(page, ARTIFACT_DIR + '/combat-barracks-dossier-desktop-1440x900.png');
});

test.describe('Combat preparation · mobile', () => {
  test.use({ hasTouch: true, isMobile: true });

  test('390x844 keeps the Barracks readable and touch-safe', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const barracks = await openBarracks(page);

    const snapshot = await barracksHealth(page);
    expect(snapshot.horizontalOverflow).toBe(false);
    expect(snapshot.screen?.left || 0).toBeGreaterThanOrEqual(-1);
    expect(snapshot.screen?.right || 9999).toBeLessThanOrEqual(391);
    expect(snapshot.shell?.width || 0).toBeGreaterThanOrEqual(388);
    expect(snapshot.unitCount).toBeGreaterThanOrEqual(16);
    expect(snapshot.firstUnit?.width || 0).toBeGreaterThan(160);
    expect(snapshot.operationsCanvasVisible).toBe(true);
    expect(snapshot.prepChromeVisible).toBe(false);

    const targets = barracks.locator('.combat-barracks-shell > .piece-info-close, .combat-barracks-shell .army-unit-tile');
    const count = await targets.count();
    for (let index = 0; index < count; index += 1) {
      const box = await targets.nth(index).boundingBox();
      if (!box) continue;
      expect(Math.min(box.width, box.height), 'Combat Barracks touch target >=44px').toBeGreaterThanOrEqual(44);
    }

    await mkdir(ARTIFACT_DIR, { recursive: true });
    await captureWarRoomFrame(page, ARTIFACT_DIR + '/combat-barracks-android-390x844.png');

    await barracks.locator('.army-unit-tile').nth(1).click();
    const dossier = page.locator('.combat-barracks-screen .army-unit-detail');
    await expect(dossier).toBeVisible();
    const dossierBox = await dossier.boundingBox();
    expect(dossierBox?.width || 0).toBeGreaterThanOrEqual(388);
    expect(dossierBox?.bottom || 9999).toBeLessThanOrEqual(845);
    await captureWarRoomFrame(page, ARTIFACT_DIR + '/combat-barracks-dossier-android-390x844.png');
  });

  test('390x844 keeps the War Table board-first and touch-safe', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const table = await openWarTable(page);

    const snapshot = await deploymentHealth(page);
    expect(snapshot.horizontalOverflow).toBe(false);
    expect(snapshot.shell?.left || 0).toBeGreaterThanOrEqual(-1);
    expect(snapshot.shell?.top ?? 9999).toBeLessThanOrEqual(1);
    expect(snapshot.shell?.right || 9999).toBeLessThanOrEqual(391);
    expect(snapshot.shell?.bottom || 0).toBeGreaterThanOrEqual(843);
    expect(snapshot.mastheadVisible).toBe(false);
    expect(snapshot.globalMusicVisible).toBe(false);
    expect(snapshot.board?.width || 0).toBeGreaterThanOrEqual(350);
    expect(snapshot.footer?.right || 9999).toBeLessThanOrEqual(391);

    const targets = table.locator('button:visible, summary:visible');
    const count = await targets.count();
    for (let index = 0; index < count; index += 1) {
      const box = await targets.nth(index).boundingBox();
      if (!box) continue;
      expect(Math.min(box.width, box.height), 'Combat War Table touch target >=44px').toBeGreaterThanOrEqual(44);
    }

    await mkdir(ARTIFACT_DIR, { recursive: true });
    await captureWarRoomFrame(page, ARTIFACT_DIR + '/combat-deployment-war-table-android-390x844.png');
  });

  test('390x844 keeps the operations room touchable and inside the viewport', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await openOperationsRoom(page);

    const snapshot = await health(page);
    expect(snapshot.horizontalOverflow).toBe(false);
    expect(snapshot.shell?.left || 0).toBeGreaterThanOrEqual(-1);
    expect(snapshot.shell?.right || 9999).toBeLessThanOrEqual(391);
    expect(snapshot.canvas?.width || 0).toBeGreaterThanOrEqual(350);
    expect(snapshot.primary?.right || 9999).toBeLessThanOrEqual(391);

    const targets = page.locator('.combat-operations-shell button:visible, .combat-operations-shell summary:visible');
    const count = await targets.count();
    for (let index = 0; index < count; index += 1) {
      const box = await targets.nth(index).boundingBox();
      if (!box) continue;
      expect(Math.min(box.width, box.height), 'Combat preparation touch target >=44px').toBeGreaterThanOrEqual(44);
    }

    await mkdir(ARTIFACT_DIR, { recursive: true });
    await captureWarRoomFrame(page, ARTIFACT_DIR + '/combat-preparation-android-390x844.png');
  });
});

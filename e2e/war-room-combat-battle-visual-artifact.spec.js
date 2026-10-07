

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

  const quick = page.getByRole('button', { name: /JUGAR CON (ESTA|FORMACIÓN RECOMENDADA)/i });
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
  await expect(page.locator('summary[aria-label="Salir"]')).toBeVisible();

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
    await expect(page.locator('summary[aria-label="Salir"]')).toBeVisible();

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
    await expect(page.locator('summary[aria-label="Salir"]')).toBeVisible();

    await mkdir(ARTIFACT_DIR, { recursive: true });
    await captureWarRoomFrame(page, ARTIFACT_DIR + '/combat-battle-android-landscape-844x390.png');
  });
});

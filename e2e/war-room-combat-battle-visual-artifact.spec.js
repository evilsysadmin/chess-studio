import { expect, test } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import {
  dismissTutorialIfVisible,
  login,
  mockApi,
  openCampaignBriefing,
} from './helpers.js';

const ARTIFACT_DIR = '../.artifacts/app-visual/combat-battle';

async function openCombatBattle(page) {
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
  await expect(battle.locator('[data-board3d-war-room="true"]')).toBeVisible({ timeout: 45_000 });
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

  await mkdir(ARTIFACT_DIR, { recursive: true });
  await page.screenshot({
    path: ARTIFACT_DIR + '/combat-battle-desktop-1440x900.png',
    animations: 'disabled',
  });
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

    await mkdir(ARTIFACT_DIR, { recursive: true });
    await page.screenshot({
      path: ARTIFACT_DIR + '/combat-battle-android-390x844.png',
      animations: 'disabled',
    });
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

    await mkdir(ARTIFACT_DIR, { recursive: true });
    await page.screenshot({
      path: ARTIFACT_DIR + '/combat-battle-android-landscape-844x390.png',
      animations: 'disabled',
    });
  });
});

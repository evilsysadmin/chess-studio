

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

const ARTIFACT_DIR = '../.artifacts/app-visual/combat-preparation';

async function openOperationsRoom(page) {
  await mockApi(page);
  await login(page);
  await openCampaignBriefing(page);
  await page.getByRole('button', { name: /PREPARAR EJÉRCITO/i }).click();
  await dismissTutorialIfVisible(page);

  const room = page.locator('[data-combat-preparation-room="generic-war-room"]');
  await expect(room).toBeVisible({ timeout: 45_000 });
  await expect(room.locator('[data-board3d-war-room="true"]')).toBeVisible({ timeout: 45_000 });
  await expect(room.locator('.board3d-main-canvas')).toBeVisible({ timeout: 45_000 });
  await expect(page.getByLabel('Resumen de preparación')).toBeVisible();
  await expect(page.getByRole('button', { name: /Personalizar despliegue/i })).toBeVisible();
  return room;
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
    };
  });
}

test('Combat preparation · desktop is a board-first operations room', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openOperationsRoom(page);

  const snapshot = await health(page);
  expect(snapshot.horizontalOverflow).toBe(false);
  expect(snapshot.shell?.height || 0).toBeGreaterThanOrEqual(680);
  expect(snapshot.canvas?.width || 0).toBeGreaterThan(900);
  expect(snapshot.canvas?.height || 0).toBeGreaterThan(600);
  expect(snapshot.primary?.bottom || 9999).toBeLessThanOrEqual((snapshot.shell?.bottom || 0) + 1);
  expect(snapshot.drawer?.bottom || 9999).toBeLessThanOrEqual((snapshot.shell?.bottom || 0) + 1);

  await mkdir(ARTIFACT_DIR, { recursive: true });
  await captureWarRoomFrame(page, ARTIFACT_DIR + '/combat-preparation-desktop-1440x900.png');
});

test.describe('Combat preparation · mobile', () => {
  test.use({ hasTouch: true, isMobile: true });

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

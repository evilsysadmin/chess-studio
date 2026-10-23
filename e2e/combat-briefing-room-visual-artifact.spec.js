import { expect, test } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { dismissTutorialIfVisible, login, mockApi, openCampaignBriefing } from './helpers.js';

const ARTIFACT_DIR = '../.artifacts/app-visual/combat-briefing-room';

async function openBriefingRoom(page) {
  await mockApi(page);
  await login(page);
  await openCampaignBriefing(page);
  await dismissTutorialIfVisible(page);

  const room = page.locator('[data-combat-campaign-room="briefing"]');
  await expect(room).toBeVisible();
  const board = room.locator('[data-board3d-war-room="true"]');
  await expect(board).toHaveAttribute('data-board3d-variant', 'combat-ops', { timeout: 45_000 });
  await expect(board).toHaveAttribute('data-board3d-variant-status', 'ready', { timeout: 45_000 });
  await expect(room.getByRole('heading', { name: 'Campaña de Combat Chess' })).toBeVisible();
  await expect(room.getByRole('complementary', { name: 'Órdenes para el sector elegido' })).toBeVisible();
  await expect(room.getByRole('button', { name: /PREPARAR EJÉRCITO/i })).toBeVisible();
  return room;
}

// Preserve the live WebGL frame when taking a browser screenshot, as in the
// shared Combat preparation visual suite. These are runtime images, not mocks.
async function captureRoom(page, path) {
  await page.evaluate(() => {
    document.querySelectorAll('.combat-briefing-test-canvas').forEach((image) => image.remove());
    const canvas = document.querySelector('[data-combat-campaign-room="briefing"] canvas.board3d-main-canvas');
    const shell = canvas?.closest('.board3d-main-shell');
    if (!canvas || !shell) throw new Error('Expected live Operations Room canvas');
    const frame = document.createElement('img');
    frame.src = canvas.toDataURL('image/png');
    frame.alt = '';
    frame.className = 'combat-briefing-test-canvas';
    const c = canvas.getBoundingClientRect();
    const s = shell.getBoundingClientRect();
    Object.assign(frame.style, {
      position: 'absolute', left: (c.left - s.left) + 'px', top: (c.top - s.top) + 'px',
      width: c.width + 'px', height: c.height + 'px', pointerEvents: 'none', zIndex: '1',
    });
    shell.appendChild(frame);
  });
  try {
    await page.waitForFunction(() => {
      const image = document.querySelector('.combat-briefing-test-canvas');
      return image?.complete && image.naturalWidth > 0;
    });
    await writeFile(path, await page.screenshot({ animations: 'disabled', caret: 'hide' }));
  } finally {
    await page.evaluate(() => document.querySelectorAll('.combat-briefing-test-canvas').forEach((image) => image.remove()));
  }
}

for (const viewport of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
  test('Combat briefing · live 3D orders folio ' + viewport.width, async ({ page }) => {
    await page.setViewportSize(viewport);
    const room = await openBriefingRoom(page);

    const metrics = await page.evaluate(() => {
      const box = (selector) => {
        const el = document.querySelector(selector);
        const r = el?.getBoundingClientRect();
        return r ? { left: r.left, right: r.right, top: r.top, bottom: r.bottom } : null;
      };
      const orders = box('.combat-briefing-room-orders');
      const status = box('.combat-briefing-room-status');
      const scenicSampleY = status && orders ? (status.bottom + orders.top) / 2 : -1;
      const scenicNode = document.elementFromPoint(innerWidth / 2, scenicSampleY);
      return {
        overflow: document.documentElement.scrollWidth > innerWidth + 1,
        orders,
        status,
        sceneUnobstructed: Boolean(scenicNode?.closest('.combat-preparation-room-stage')),
        cta: box('.combat-briefing-room-orders .campaign-main-cta'),
        room: box('[data-combat-campaign-room="briefing"]'),
      };
    });
    expect(metrics.overflow).toBe(false);
    expect(metrics.orders.left).toBeGreaterThanOrEqual(0);
    expect(metrics.orders.right).toBeLessThanOrEqual(viewport.width + 1);
    expect(metrics.orders.bottom).toBeLessThanOrEqual(viewport.height + 1);
    if (viewport.width < 720) {
      expect(metrics.orders.top - metrics.status.bottom).toBeGreaterThan(65);
      expect(metrics.sceneUnobstructed).toBe(true);
      expect(metrics.cta.bottom).toBeLessThan(viewport.height - 8);
    }
    await mkdir(ARTIFACT_DIR, { recursive: true });
    await captureRoom(page, ARTIFACT_DIR + '/combat-briefing-room-' + viewport.width + 'x' + viewport.height + '.png');

    if (viewport.width < 720) {
      const inspect = room.getByRole('button', { name: /Inspeccionar ejército/i });
      await expect(inspect).toBeVisible();
      const canvas = room.locator('canvas.board3d-main-canvas');
      const originalCanvas = await canvas.elementHandle();
      const framingBefore = await canvas.getAttribute('data-board3d-camera-framing');
      const projectionBefore = await canvas.getAttribute('data-board3d-view-projection');
      await inspect.click();
      await expect(canvas).toHaveAttribute('data-board3d-camera-framing', 'combat-inspection-portrait-v1');
      expect(await page.evaluate((el) =>
        el === document.querySelector('[data-combat-campaign-room="briefing"] canvas.board3d-main-canvas'), originalCanvas)).toBe(true);
      expect(await canvas.getAttribute('data-board3d-view-projection')).not.toBe(projectionBefore);
      await expect(room.locator('.combat-briefing-room-orders')).not.toBeVisible();
      await expect(room.locator('.combat-preparation-room-stage')).toBeVisible();
      await expect(room.getByRole('button', { name: /Volver a órdenes/i })).toBeVisible();
      const unobstructed = await page.evaluate(() =>
        Boolean(document.elementFromPoint(innerWidth / 2, innerHeight * .62)
          ?.closest('.combat-preparation-room-stage')));
      expect(unobstructed).toBe(true);
      await captureRoom(page, ARTIFACT_DIR + '/combat-briefing-army-inspection-390x844.png');
      await page.keyboard.press('Escape');
      await expect(canvas).toHaveAttribute('data-board3d-camera-framing', framingBefore);
      expect(await page.evaluate((el) =>
        el === document.querySelector('[data-combat-campaign-room="briefing"] canvas.board3d-main-canvas'), originalCanvas)).toBe(true);
      await expect(room.locator('.combat-briefing-room-orders')).toBeVisible();
      await expect(room.getByRole('button', { name: /PREPARAR EJÉRCITO/i })).toBeVisible();
      await inspect.click();
      await expect(room.locator('.combat-briefing-room-orders')).not.toBeVisible();
      await room.getByRole('button', { name: /Volver a órdenes/i }).click();
      await expect(room.locator('.combat-briefing-room-orders')).toBeVisible();
    }

    // Optional dossiers are keyboard-accessible, and not dashboard cards
    // occupying the viewport before the player asks for them.
    const secondaryOrders = room.locator('details.campaign-mission-orders-fold');
    await expect(secondaryOrders).toBeVisible();
    await expect(secondaryOrders).not.toHaveAttribute('open');
    await secondaryOrders.locator('summary').focus();
    await page.keyboard.press('Enter');
    await expect(secondaryOrders).toHaveAttribute('open');
    await expect(secondaryOrders.getByRole('region', { name: 'Órdenes opcionales de misión' })).toBeVisible();
    await page.keyboard.press('Enter');
    await expect(secondaryOrders).not.toHaveAttribute('open');

    const enemyDossier = room.locator('details.campaign-officer-orders');
    await expect(enemyDossier).toBeVisible();
    await expect(enemyDossier).not.toHaveAttribute('open');
    await enemyDossier.locator('summary').click();
    await expect(enemyDossier).toHaveAttribute('open');
    await enemyDossier.locator('summary').click();

    // The briefing keeps the existing campaign -> army preparation transition.
    await room.getByRole('button', { name: /PREPARAR EJÉRCITO/i }).click();
    await expect(page.locator('[data-combat-preparation-room="combat-operations-room"]')).toBeVisible();
  });
}

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
      return {
        overflow: document.documentElement.scrollWidth > innerWidth + 1,
        orders: box('.combat-briefing-room-orders'),
        room: box('[data-combat-campaign-room="briefing"]'),
      };
    });
    expect(metrics.overflow).toBe(false);
    expect(metrics.orders.left).toBeGreaterThanOrEqual(0);
    expect(metrics.orders.right).toBeLessThanOrEqual(viewport.width + 1);
    expect(metrics.orders.bottom).toBeLessThanOrEqual(viewport.height + 1);
    await mkdir(ARTIFACT_DIR, { recursive: true });
    await captureRoom(page, ARTIFACT_DIR + '/combat-briefing-room-' + viewport.width + 'x' + viewport.height + '.png');

    // The briefing keeps the existing campaign -> army preparation transition.
    await room.getByRole('button', { name: /PREPARAR EJÉRCITO/i }).click();
    await expect(page.locator('[data-combat-preparation-room="combat-operations-room"]')).toBeVisible();
  });
}

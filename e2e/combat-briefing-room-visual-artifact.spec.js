import { expect, test } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { dismissTutorialIfVisible, login, mockApi, openCampaignBriefing } from './helpers.js';
import { readBoard3DProjection } from './board3d-projection.js';

const ARTIFACT_DIR = '../.artifacts/app-visual/combat-briefing-room';

async function openBriefingRoom(page) {
  await mockApi(page);
  await login(page);
  // Put this proven veteran on the near rank (a1), not on a2 behind the
  // rook: screenshot proof must show the physical medals without occlusion.
  // The fixture exists only in the isolated browser, never in real user state.
  await page.evaluate(() => {
    const key = 'chess-study-combat-roster';
    const roster = JSON.parse(localStorage.getItem(key) || '{}');
    const identityId = 'e2e-proven-veteran-001';
    const identity = { ...(roster.identities?.['r-a'] || {}), identityId, alias: 'Varela' };
    roster.identities = { ...(roster.identities || {}), 'r-a': identity };
    roster.deployment = { ...(roster.deployment || {}), 'r-a': 'r-a' };
    roster.pieces = { ...(roster.pieces || {}), 'r-a': { ...(roster.pieces?.['r-a'] || {}), strengthPoints: 3, speedPoints: 1, alive: true } };
    roster.unitRecords = {
      ...(roster.unitRecords || {}),
      [identityId]: {
        identityId, alias: 'Varela', slotKey: 'r-a',
        decorations: [
          { id: 'baptism', earnedAt: '2026-10-20T00:00:00Z' },
          { id: 'five_kills', earnedAt: '2026-10-21T00:00:00Z' },
          { id: 'boss_survivor', earnedAt: '2026-10-22T00:00:00Z' },
        ],
        stats: { battles: 5, survivals: 5, kills: 5, bossVictories: 1 },
      },
    };
    localStorage.setItem(key, JSON.stringify(roster));
  });
  await openCampaignBriefing(page);
  await dismissTutorialIfVisible(page);

  const room = page.locator('[data-combat-campaign-room="briefing"]');
  await expect(room).toBeVisible();
  const board = room.locator('[data-board3d-war-room="true"]');
  await expect(board).toHaveAttribute('data-board3d-variant', 'combat-ops', { timeout: 45_000 });
  await expect(board).toHaveAttribute('data-board3d-variant-status', 'ready', { timeout: 45_000 });
  // The GLB is not visually accepted until the real seeded campaign is on it.
  const canvas = room.locator('canvas.board3d-main-canvas');
  await expect(canvas).toHaveAttribute('data-combat-operations-map-nodes', '19', { timeout: 45_000 });
  await expect(canvas).toHaveAttribute('data-combat-operations-map-edges', /^[1-9][0-9]*$/, { timeout: 45_000 });
  await expect(room.locator('[data-war-room-scene-gate]')).toHaveAttribute('data-war-room-scene-gate', 'ready', { timeout: 45_000 });
  // Confirm that the canvas really rendered medals from the loaded saved
  // identity, not a synthetic screenshot overlay or mere rank decoration.
  await expect(canvas).toHaveAttribute('data-board3d-decorated-pieces', '1', { timeout: 45_000 });
  await expect(canvas).toHaveAttribute('data-board3d-medal-seals', '3', { timeout: 45_000 });
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
      // The Map affordance must be reachable without sliding a long resources
      // rail. Verify narrow 360/390/430 widths against the actual hit target,
      // not just a visible DOM node outside the viewport.
      for (const width of [360, 390, 430]) {
        await page.setViewportSize({ width, height: viewport.height });
        const mapPosition = await page.evaluate(() => {
          const selector = document.querySelector('.combat-briefing-map-lookup select');
          const lookup = document.querySelector('.combat-briefing-map-lookup');
          const rail = document.querySelector('.combat-briefing-resource-rail');
          const a = selector?.getBoundingClientRect();
          const b = lookup?.getBoundingClientRect();
          const c = rail?.getBoundingClientRect();
          const center = a && document.elementFromPoint(a.left + a.width / 2, a.top + a.height / 2);
          return {
            width: innerWidth,
            left: b?.left, right: b?.right,
            railRight: c?.right,
            accessible: Boolean(center === selector || selector?.contains(center)),
            inRail: Boolean(lookup?.closest('.combat-briefing-resource-rail')),
            overflow: document.documentElement.scrollWidth > innerWidth + 1,
          };
        });
        expect(mapPosition.left).toBeGreaterThanOrEqual(0);
        expect(mapPosition.right).toBeLessThanOrEqual(width - 4);
        expect(mapPosition.railRight).toBeLessThanOrEqual(mapPosition.left + 1);
        expect(mapPosition.accessible).toBe(true);
        expect(mapPosition.inRail).toBe(false);
        expect(mapPosition.overflow).toBe(false);
      }
      await page.setViewportSize(viewport);
    }
    // The physical map is consultation only. Its keyboard-accessible twin
    // must never navigate to another node or restart the canvas.
    const consultation = room.getByRole('combobox', { name: 'Consultar sector del mapa' });
    await expect(consultation).toBeVisible();
    await consultation.selectOption('start');
    await expect(room.locator('.combat-briefing-map-readout')).toContainText('Base');
    await expect(room.locator('.combat-briefing-map-readout')).toContainText('Posición actual');
    await expect(room.getByRole('button', { name: /PREPARAR EJÉRCITO/i })).toBeVisible();
    await room.getByRole('button', { name: 'Cerrar consulta de mapa' }).click();
    await expect(room.locator('.combat-briefing-map-readout')).toHaveCount(0);


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
      await expect(room.locator('.combat-briefing-room-intro')).not.toBeVisible();
      await expect(room.locator('.combat-briefing-room-status')).not.toBeVisible();
      await expect(room.getByRole('button', { name: /Salir de Combat Chess/i })).toBeVisible();
      await expect(room.getByRole('button', { name: /Tutorial de campaña/i })).toBeVisible();
      await expect(room.locator('.combat-preparation-room-stage')).toBeVisible();
      await expect(room.getByRole('button', { name: /Volver a órdenes/i })).toBeVisible();
      const unobstructed = await page.evaluate(() =>
        Boolean(document.elementFromPoint(innerWidth / 2, innerHeight * .62)
          ?.closest('.combat-preparation-room-stage')));
      expect(unobstructed).toBe(true);
      const upperRoomUnobstructed = await page.evaluate(() =>
        Boolean(document.elementFromPoint(innerWidth / 2, innerHeight * .14)
          ?.closest('.combat-preparation-room-stage')));
      expect(upperRoomUnobstructed).toBe(true);
      await captureRoom(page, ARTIFACT_DIR + '/combat-briefing-army-inspection-390x844.png');
      // Nothing is imposed on the initial scene. The native selector proves
      // screen-reader/keyboard access to the same real identity as piece taps.
      await expect(room.locator('[data-combat-veteran-dossier]')).toHaveCount(0);
      const veteranPicker = room.getByRole('combobox', { name: 'Consultar veterano desplegado' });
      await expect(veteranPicker).toBeVisible();
      const projection = await readBoard3DProjection(canvas);
      const rook = projection.square('a1', 0.72);
      expect(rook.x).toBeGreaterThan(0);
      expect(rook.x).toBeLessThan(viewport.width);
      expect(rook.y).toBeGreaterThan(0);
      expect(rook.y).toBeLessThan(viewport.height);
      await page.mouse.click(rook.x, rook.y);
      const dossier = room.getByRole('complementary', { name: 'Expediente de Varela' });
      await expect(dossier).toBeVisible();
      await dossier.getByRole('button', { name: 'Cerrar expediente del veterano' }).click();
      await expect(dossier).toHaveCount(0);
      // A native twin is still present for touch precision and accessibility.
      await veteranPicker.selectOption('a1');
      await expect(dossier).toBeVisible();
      await expect(dossier).toContainText('Teniente');
      await expect(dossier).toContainText('5 batallas');
      await expect(dossier).toContainText('Bautismo de fuego');
      await expect(dossier).toContainText('Cinco bajas');
      await expect(dossier).toContainText('Cicatriz del jefe');
      // One real live-WebGL screenshot with the veteran's service folio open.
      await captureRoom(page, ARTIFACT_DIR + '/combat-briefing-veteran-dossier-390x844.png');
      await page.keyboard.press('Escape');
      await expect(dossier).toHaveCount(0);
      await expect(room.locator('.combat-briefing-room-orders')).not.toBeVisible();
      await page.keyboard.press('Escape');
      await expect(canvas).toHaveAttribute('data-board3d-camera-framing', framingBefore);
      expect(await page.evaluate((el) =>
        el === document.querySelector('[data-combat-campaign-room="briefing"] canvas.board3d-main-canvas'), originalCanvas)).toBe(true);
      await expect(room.locator('.combat-briefing-room-orders')).toBeVisible();
      await expect(room.locator('.combat-briefing-room-intro')).toBeVisible();
      await expect(room.locator('.combat-briefing-room-status')).toBeVisible();
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

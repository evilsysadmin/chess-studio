import { mkdir, writeFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import { activateSetupControl, buttonWithVisibleText, login, mockApi } from './helpers.js';

const OUTPUT = '../.artifacts/app-visual';
const VIEWPORTS = [
  { width: 1440, height: 900 },
  { width: 390, height: 844 },
  { width: 844, height: 390 },
];

async function captureRoomWithDrawer(page, label) {
  // SwiftShader headless screenshots may omit WebGL compositor layers. Use
  // the same drawing-buffer raster approach as the canonical War Room producer.
  await page.evaluate(() => {
    const canvas = document.querySelector('canvas.board3d-main-canvas');
    const shell = canvas?.closest('.board3d-main-shell');
    if (!canvas || !shell) throw new Error('Missing live War Room canvas');
    const rect = canvas.getBoundingClientRect();
    const parent = shell.getBoundingClientRect();
    const image = document.createElement('img');
    image.src = canvas.toDataURL('image/png');
    image.alt = '';
    image.dataset.capturesVisualCanvas = 'true';
    Object.assign(image.style, {
      position: 'absolute',
      left: (rect.left - parent.left) + 'px',
      top: (rect.top - parent.top) + 'px',
      width: rect.width + 'px',
      height: rect.height + 'px',
      zIndex: '1',
      pointerEvents: 'none',
    });
    shell.appendChild(image);
  });
  try {
    await page.waitForFunction(() => {
      const image = document.querySelector('img[data-captures-visual-canvas]');
      return image?.complete && image.naturalWidth > 0;
    });
    const png = await page.screenshot({
      fullPage: false, animations: 'disabled', caret: 'hide', timeout: 90_000,
    });
    await mkdir(OUTPUT, { recursive: true });
    await writeFile(OUTPUT + '/' + label + '.png', png);
  } finally {
    await page.evaluate(() => {
      document.querySelectorAll('img[data-captures-visual-canvas]').forEach((node) => node.remove());
    });
  }
}

test('War Room · cajón de capturas abierto: escritorio, móvil vertical y horizontal', async ({ page }) => {
  test.setTimeout(240_000);
  await page.setViewportSize(VIEWPORTS[0]);
  await mockApi(page, {
    profileSeed: {
      'chess-study-mechanic-tutorial-progress-v1': JSON.stringify({ 'war-room-basics': { seen: true } }),
      'chess-study-war-room-variant-v1': 'v3',
      'matthias.onboarded': '2',
    },
  });
  await login(page);
  await buttonWithVisibleText(page, 'Partida rápida').click();
  await activateSetupControl(page.getByRole('button', { name: 'Empezar partida', exact: true }));
  await expect(page.locator('.board-live-row.is-3d-warroom')).toBeVisible({ timeout: 90_000 });
  await expect(page.locator('canvas.board3d-main-canvas')).toBeVisible({ timeout: 90_000 });

  for (const viewport of VIEWPORTS) {
    await page.setViewportSize(viewport);
    const toggle = page.getByRole('button', { name: 'Mostrar capturas', exact: true });
    await expect(toggle).toBeVisible({ timeout: 45_000 });
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    const hit = await toggle.boundingBox({ timeout: 45_000 });
    expect(hit).not.toBeNull();
    expect(hit.width).toBeGreaterThanOrEqual(viewport.width < 900 ? 42 : 30);
    expect(hit.height).toBeGreaterThanOrEqual(viewport.width < 900 ? 42 : 38);
    // Pair both states from the same running room and viewport. A separate
    // golden screenshot may use different camera framing, chat, or GPU state.
    const boardBefore = await page.locator('.board3d-main-shell').boundingBox();
    expect(boardBefore).not.toBeNull();
    await captureRoomWithDrawer(page, 'war-room-captures-closed-' + viewport.width + 'x' + viewport.height);
    await toggle.click({ timeout: 45_000 });
    const panel = page.getByRole('region', { name: 'Capturas de la partida' });
    await expect(panel).toBeVisible({ timeout: 45_000 });
    await expect(panel).toContainText('Tus capturas');
    await expect(panel).toContainText('Capturas de Matthias');
    const box = await panel.boundingBox({ timeout: 45_000 });
    expect(box).not.toBeNull();
    expect(box.x).toBeGreaterThanOrEqual(-1);
    expect(box.y).toBeGreaterThanOrEqual(-1);
    expect(box.x + box.width).toBeLessThanOrEqual(viewport.width + 1);
    expect(box.y + box.height).toBeLessThanOrEqual(viewport.height + 1);
    // The opt-in drawer must overlay the scene, not shrink or displace the
    // playable board when expanded on desktop, portrait or landscape.
    const boardAfter = await page.locator('.board3d-main-shell').boundingBox();
    expect(boardAfter).not.toBeNull();
    for (const axis of ['x', 'y', 'width', 'height']) {
      expect(boardAfter[axis], 'board ' + axis + ' moved when captures opened')
        .toBeCloseTo(boardBefore[axis], 0);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
    await captureRoomWithDrawer(page, 'war-room-captures-open-' + viewport.width + 'x' + viewport.height);
    await page.getByRole('button', { name: 'Ocultar capturas', exact: true }).click({ timeout: 45_000 });
    await expect(panel).toHaveCount(0);
  }
});

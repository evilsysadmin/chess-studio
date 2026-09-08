import { expect, test } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { login, mockApi, openMoreGameModes } from './helpers.js';

const ARTIFACT_DIR = '../.artifacts/chesscom-visual';

async function dismissGuide(page) {
  const guide = page.getByRole('region', { name: 'Guía rápida de Chess Studio' });
  if (!(await guide.isVisible().catch(() => false))) return;
  const dismiss = guide.getByRole('button', { name: 'Ahora no', exact: true });
  if (await dismiss.isVisible().catch(() => false)) {
    await dismiss.click();
    return;
  }
  const close = guide.getByRole('button', { name: 'Cerrar guía rápida', exact: true });
  if (await close.isVisible().catch(() => false)) await close.click();
}

async function openChesscom(page) {
  await mockApi(page);
  await login(page);
  await dismissGuide(page);
  const moreModes = await openMoreGameModes(page);
  await moreModes.getByRole('button').filter({ hasText: 'Experimentos geniales' }).click();
  await page.getByRole('button', { name: /Chesscom/ }).click();
  await expect(page.getByRole('heading', { name: 'CHESSCOM', exact: true })).toBeVisible();

  const mode = page.locator('[data-chesscom-poc="true"][data-chesscom-renderer="babylon"]');
  const host = mode.locator('.chesscom-babylon-host');
  await expect(host.locator('canvas')).toBeVisible({ timeout: 30_000 });
  await expect(mode.getByText('BABYLON · ERROR', { exact: true })).toHaveCount(0);
  await expect.poll(() => host.getAttribute('data-chesscom-render-scale')).not.toBeNull();
  return { mode, host };
}

async function settleFrames(page) {
  await page.evaluate(() => new Promise((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(resolve));
  }));
  await page.waitForTimeout(250);
}

async function collectRenderMetadata(page, host, label) {
  return host.evaluate((node, captureLabel) => {
    const canvas = node.querySelector('canvas');
    const rect = canvas?.getBoundingClientRect?.();
    return {
      label:captureLabel,
      viewport:{ width:window.innerWidth, height:window.innerHeight },
      devicePixelRatio:window.devicePixelRatio,
      canvas:canvas ? {
        width:canvas.width,
        height:canvas.height,
        cssWidth:Math.round(rect?.width || 0),
        cssHeight:Math.round(rect?.height || 0),
      } : null,
      renderer:node.dataset.chesscomRenderer || node.closest('[data-chesscom-renderer]')?.dataset.chesscomRenderer || null,
      renderScale:node.dataset.chesscomRenderScale || null,
      sceneTier:node.dataset.chesscomSceneTier || null,
      shadowMode:node.dataset.chesscomShadowMode || null,
      depth:node.dataset.chesscomDepth || null,
      lighting:node.dataset.chesscomLighting || null,
      materials:node.dataset.chesscomMaterials || null,
      overlay:node.dataset.chesscomOverlay || null,
    };
  }, label);
}

test('Chesscom · genera referencia visual desktop + móvil con metadata de render', async ({ page }) => {
  test.setTimeout(120_000);
  await mkdir(ARTIFACT_DIR, { recursive:true });

  await page.setViewportSize({ width:1600, height:900 });
  const { host } = await openChesscom(page);
  await settleFrames(page);

  const desktop = await collectRenderMetadata(page, host, 'desktop-1600x900');
  await page.screenshot({
    path:`${ARTIFACT_DIR}/chesscom-desktop-1600x900.png`,
    fullPage:false,
    animations:'disabled',
  });

  await page.setViewportSize({ width:390, height:844 });
  await settleFrames(page);
  const mobile = await collectRenderMetadata(page, host, 'mobile-390x844');
  await page.screenshot({
    path:`${ARTIFACT_DIR}/chesscom-mobile-390x844.png`,
    fullPage:false,
    animations:'disabled',
  });

  await writeFile(
    `${ARTIFACT_DIR}/render-metadata.json`,
    `${JSON.stringify({ schema:1, captures:[desktop, mobile] }, null, 2)}\n`,
    'utf8',
  );

  expect(desktop.canvas?.width).toBeGreaterThan(0);
  expect(desktop.canvas?.height).toBeGreaterThan(0);
  expect(mobile.canvas?.width).toBeGreaterThan(0);
  expect(mobile.canvas?.height).toBeGreaterThan(0);
});

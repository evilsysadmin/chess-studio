import { expect, test } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { login, mockApi, openMoreGameModes } from './helpers.js';

const ARTIFACT_DIR = '../.artifacts/chesscom-visual';
const MIN_EFFECTIVE_PIXEL_RATIO = 0.75;
const MIN_HEADER_GAP = 10;

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
    const cssWidth = Math.round(rect?.width || 0);
    const cssHeight = Math.round(rect?.height || 0);
    const width = canvas?.width || 0;
    const height = canvas?.height || 0;
    const brandRect = document.querySelector('.chesscom-brand')?.getBoundingClientRect?.();
    const exitRect = document.querySelector('.chesscom-exit')?.getBoundingClientRect?.();
    const headerOverlap = brandRect && exitRect
      ? !(
        brandRect.right <= exitRect.left + 1
        || exitRect.right <= brandRect.left + 1
        || brandRect.bottom <= exitRect.top + 1
        || exitRect.bottom <= brandRect.top + 1
      )
      : null;
    return {
      label:captureLabel,
      viewport:{ width:window.innerWidth, height:window.innerHeight },
      documentScrollWidth:document.documentElement.scrollWidth,
      devicePixelRatio:window.devicePixelRatio,
      canvas:canvas ? {
        width,
        height,
        cssWidth,
        cssHeight,
        effectivePixelRatioX:cssWidth > 0 ? Number((width / cssWidth).toFixed(3)) : 0,
        effectivePixelRatioY:cssHeight > 0 ? Number((height / cssHeight).toFixed(3)) : 0,
      } : null,
      header:brandRect && exitRect ? {
        brandRight:Number(brandRect.right.toFixed(2)),
        exitLeft:Number(exitRect.left.toFixed(2)),
        gap:Number((exitRect.left - brandRect.right).toFixed(2)),
        overlap:headerOverlap,
      } : null,
      renderer:node.dataset.chesscomRenderer || node.closest('[data-chesscom-renderer]')?.dataset.chesscomRenderer || null,
      backend:node.dataset.chesscomBackend || null,
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

function expectHealthyCapture(capture) {
  expect(capture.canvas).not.toBeNull();
  expect(capture.canvas?.width).toBeGreaterThan(0);
  expect(capture.canvas?.height).toBeGreaterThan(0);
  expect(capture.canvas?.cssWidth).toBeGreaterThan(0);
  expect(capture.canvas?.cssHeight).toBeGreaterThan(0);
  expect(capture.canvas?.cssWidth).toBeLessThanOrEqual(capture.viewport.width + 1);
  expect(capture.documentScrollWidth).toBeLessThanOrEqual(capture.viewport.width + 1);
  expect(capture.canvas?.effectivePixelRatioX).toBeGreaterThanOrEqual(MIN_EFFECTIVE_PIXEL_RATIO);
  expect(capture.canvas?.effectivePixelRatioY).toBeGreaterThanOrEqual(MIN_EFFECTIVE_PIXEL_RATIO);
  expect(capture.header).not.toBeNull();
  expect(capture.header?.overlap).toBe(false);
  expect(capture.header?.gap).toBeGreaterThanOrEqual(MIN_HEADER_GAP);
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
    `${JSON.stringify({ schema:4, minimumEffectivePixelRatio:MIN_EFFECTIVE_PIXEL_RATIO, minimumHeaderGap:MIN_HEADER_GAP, captures:[desktop, mobile] }, null, 2)}\n`,
    'utf8',
  );

  expectHealthyCapture(desktop);
  expectHealthyCapture(mobile);
});

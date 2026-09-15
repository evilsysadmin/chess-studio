import { expect, test } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { login, mockApi, openMoreGameModes } from './helpers.js';

const ARTIFACT_DIR = '../.artifacts/app-visual';
const CAPTURES = [
  { label: 'desktop-1440x900', width: 1440, height: 900, hasTouch: false },
  { label: 'android-390x844', width: 390, height: 844, hasTouch: true },
];
const PARTY = [
  { id: 'matthias', name: 'Matthias', artSource: 'blender-home-canonical-v1' },
  { id: 'hildegard', name: 'Hildegard', artSource: 'chronicles-tactics-party-v3' },
  { id: 'aziz', name: 'Aziz', artSource: 'chronicles-tactics-party-v3' },
  { id: 'morcilla', name: 'Faust', artSource: 'chronicles-tactics-party-v3' },
];

async function openChronicles(page) {
  await mockApi(page, {
    profileSeed: {
      'matthias.onboarded': '2',
      'chess-study-home-guide-dismissed-v1': '1',
    },
  });
  await login(page);
  const speech = page.getByRole('region', { name: 'Mensaje de Matthias', exact: true });
  if (await speech.isVisible().catch(() => false)) {
    const close = speech.getByRole('button', { name: 'Cerrar comentario de Matthias', exact: true });
    if (await close.isVisible().catch(() => false)) await close.click({ force: true });
  }
  await openMoreGameModes(page);
  const tools = page.locator('#illustrated-home-tools');
  await expect(tools).toBeVisible();
  await tools.getByRole('button').filter({ hasText: 'Experimentos geniales' }).click();
  await expect(page.getByRole('heading', { name: 'Experimentos geniales', exact: true })).toBeVisible();
  await page.getByRole('button', { name: /BOOK I.*Chronicles of Matthias/i }).click();
  await expect(page.getByRole('heading', { name: 'Chronicles of Matthias', exact: true })).toBeVisible();
  await expect(page.locator('[data-chronicles-party-renderer="three"] canvas')).toHaveCount(1, { timeout: 20_000 });
}

async function captureElement(page, locator, path) {
  // DOM scrolling avoids Playwright's stability wait, which is unreliable on a
  // continuously rendered WebGL surface. boundingBox() is viewport-relative,
  // so do not add window.scrollX/Y a second time when clipping the screenshot.
  await locator.evaluate((node) => node.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'instant' }));
  await page.waitForTimeout(100);
  const box = await locator.boundingBox();
  expect(box, `${path}: capture bounds`).not.toBeNull();
  await page.screenshot({
    path,
    animations: 'disabled',
    timeout: 30_000,
    clip: {
      x: Math.max(0, box.x),
      y: Math.max(0, box.y),
      width: Math.max(1, box.width),
      height: Math.max(1, box.height),
    },
  });
}

for (const capture of CAPTURES) {
  test(`Chronicles · los cuatro avatares 3D · ${capture.label}`, async ({ browser }) => {
    // Hosted SwiftShader needs materially more wall-clock budget for four
    // sequential desktop WebGL portraits than Android. Keep Android tight while
    // giving desktop enough headroom to finish real captures instead of timing
    // out during context cleanup after the screenshots already succeeded.
    test.setTimeout(capture.hasTouch ? 150_000 : 210_000);
    await mkdir(ARTIFACT_DIR, { recursive: true });

    const context = await browser.newContext({
      viewport: { width: capture.width, height: capture.height },
      hasTouch: capture.hasTouch,
      isMobile: capture.hasTouch,
    });
    const page = await context.newPage();
    try {
      await openChronicles(page);
      const preview = page.locator('.chronicles-party-preview');
      const portraitHost = page.locator('[data-chronicles-party-renderer="three"]');
      const portraitCanvas = portraitHost.locator('canvas');
      await expect(preview).toBeVisible();
      await expect(portraitCanvas).toBeVisible();

      for (const member of PARTY) {
        await page.getByRole('button', { name: `Seleccionar ${member.name}`, exact: true }).click();
        await expect(preview.locator('strong')).toHaveText(member.name);
        await expect(portraitHost).toHaveAttribute('data-chronicles-party-art-source', member.artSource, { timeout: 20_000 });
        const canvasBox = await portraitCanvas.boundingBox();
        expect(canvasBox, `${capture.label}/${member.name}: canvas bounds`).not.toBeNull();
        expect(canvasBox.width, `${capture.label}/${member.name}: canvas width`).toBeGreaterThan(80);
        expect(canvasBox.height, `${capture.label}/${member.name}: canvas height`).toBeGreaterThan(80);
        await captureElement(
          page,
          preview,
          `${ARTIFACT_DIR}/chronicles-avatar-${member.id}-${capture.label}.png`,
        );
      }
    } finally {
      await context.close();
    }
  });
}

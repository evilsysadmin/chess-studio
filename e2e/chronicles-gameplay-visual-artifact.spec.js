import { expect, test } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { login, mockApi } from './helpers.js';

const ARTIFACT_DIR = '../.artifacts/app-visual';
const CAPTURES = [
  { label: 'desktop-1440x900', width: 1440, height: 900, hasTouch: false },
  { label: 'android-390x844', width: 390, height: 844, hasTouch: true },
];

async function openVisualMoreModes(page) {
  const trigger = page.getByRole('button', { name: /Más modos y herramientas/ });
  await expect(trigger).toBeVisible();

  // Keep the first attempt bounded but long enough for the illustrated Home
  // entrance motion to settle; known blockers still avoid the full 30 s burn.
  try {
    await trigger.click({ timeout: 5_000 });
  } catch (error) {
    // Playwright can time out after the click itself has already landed while it
    // waits for unrelated scheduled navigation work. Accept the interaction if
    // Home has in fact opened the tools panel instead of throwing away a valid
    // desktop visual capture.
    const tools = page.locator('#illustrated-home-tools');
    if (await tools.isVisible().catch(() => false)) return;

    const pvpLobby = page.getByRole('dialog', { name: 'Duelo 1 contra 1 · War Room', exact: true });
    if (!(await pvpLobby.isVisible().catch(() => false))) throw error;
    await pvpLobby.getByRole('button', { name: /Cerrar ventana/ }).click();
    await expect(pvpLobby).toBeHidden();
    await trigger.click();
  }
}

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

  // This producer owns Chronicles evidence, not PvP. A restored/mock lobby can
  // legitimately cover Home on touch viewports, so dismiss it explicitly
  // instead of forcing clicks through an unrelated modal.
  const pvpLobby = page.getByRole('dialog', { name: 'Duelo 1 contra 1 · War Room', exact: true });
  if (await pvpLobby.isVisible().catch(() => false)) {
    await pvpLobby.getByRole('button', { name: /Cerrar ventana/ }).click();
    await expect(pvpLobby).toBeHidden();
  }

  await openVisualMoreModes(page);
  const tools = page.locator('#illustrated-home-tools');
  await expect(tools).toBeVisible();
  await tools.getByRole('button').filter({ hasText: 'Experimentos geniales' }).click();
  await expect(page.getByRole('heading', { name: 'Experimentos geniales', exact: true })).toBeVisible();
  await page.getByRole('button', { name: /BOOK I.*Chronicles of Matthias/i }).click();
  await expect(page.getByRole('heading', { name: 'Chronicles of Matthias', exact: true })).toBeVisible();
}

async function captureChroniclesHealth(page) {
  return page.evaluate(() => {
    const root = document.documentElement;
    const rect = (selector) => {
      const node = document.querySelector(selector);
      if (!node) return null;
      const box = node.getBoundingClientRect();
      return {
        left: Number(box.left.toFixed(1)), top: Number(box.top.toFixed(1)),
        right: Number(box.right.toFixed(1)), bottom: Number(box.bottom.toFixed(1)),
        width: Number(box.width.toFixed(1)), height: Number(box.height.toFixed(1)),
      };
    };
    return {
      horizontalOverflow: root.scrollWidth > root.clientWidth + 1,
      gameCanvasCount: document.querySelectorAll('[data-chronicles-renderer="three"] canvas').length,
      authoredPortraitCount: document.querySelectorAll('[data-chronicles-party-renderer="authored"]').length,
      stage: rect('.chronicles-stage'),
      gameCanvas: rect('[data-chronicles-renderer="three"] canvas'),
      authoredPortrait: rect('[data-chronicles-party-renderer="authored"]'),
    };
  });
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
  test(`Chronicles · gameplay visual · ${capture.label}`, async ({ browser }) => {
    // Hosted SwiftShader makes large WebGL readbacks expensive. Keep this
    // producer to one canonical readback per viewport; Tactics owns a separate
    // focused producer so neither surface can starve the other of its budget.
    test.setTimeout(150_000);
    await mkdir(ARTIFACT_DIR, { recursive: true });

    const context = await browser.newContext({
      viewport: { width: capture.width, height: capture.height },
      hasTouch: capture.hasTouch,
      isMobile: capture.hasTouch,
    });
    const page = await context.newPage();
    try {
      await openChronicles(page);
      const chroniclesCanvas = page.locator('[data-chronicles-renderer="three"] canvas');
      const authoredPortrait = page.locator('[data-chronicles-party-renderer="authored"]');
      const stage = page.locator('.chronicles-stage');
      await expect(chroniclesCanvas).toHaveCount(1, { timeout: 20_000 });
      await expect(chroniclesCanvas).toBeVisible();
      await expect(authoredPortrait).toHaveCount(1, { timeout: 20_000 });
      await expect(authoredPortrait).toBeVisible();
      await expect(stage).toBeVisible();
      await page.waitForTimeout(450);

      const health = await captureChroniclesHealth(page);
      expect(health.horizontalOverflow, `${capture.label}: Chronicles overflow`).toBe(false);
      expect(health.gameCanvasCount, `${capture.label}: Chronicles dungeon canvas`).toBe(1);
      expect(health.authoredPortraitCount, `${capture.label}: Chronicles authored portrait`).toBe(1);
      expect(health.stage?.width || 0, `${capture.label}: Chronicles stage visible`).toBeGreaterThan(0);
      expect(health.gameCanvas?.width || 0, `${capture.label}: Chronicles dungeon canvas visible`).toBeGreaterThan(0);
      expect(health.gameCanvas?.height || 0, `${capture.label}: Chronicles dungeon canvas height`).toBeGreaterThan(0);
      expect(health.authoredPortrait?.width || 0, `${capture.label}: Chronicles portrait visible`).toBeGreaterThan(0);
      expect(health.authoredPortrait?.height || 0, `${capture.label}: Chronicles portrait height`).toBeGreaterThan(0);

      await captureElement(page, stage, `${ARTIFACT_DIR}/chronicles-playing-${capture.label}.png`);
      await writeFile(
        `${ARTIFACT_DIR}/chronicles-visual-health-${capture.label}.json`,
        `${JSON.stringify({ schema: 3, scope: 'chronicles', capture: { label: capture.label, ...health } }, null, 2)}\n`,
        'utf8',
      );
    } finally {
      await context.close();
    }
  });
}

import { expect, test } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { login, mockApi, openMoreGameModes } from './helpers.js';

const ARTIFACT_DIR = '../.artifacts/app-visual';
const CAPTURES = [
  { label: 'desktop-1440x900', width: 1440, height: 900, hasTouch: false },
  { label: 'android-390x844', width: 390, height: 844, hasTouch: true },
];

async function dismissGuide(page) {
  const guide = page.getByRole('region', { name: 'Guía rápida de Chess Studio' });
  if (!(await guide.isVisible().catch(() => false))) return;
  const dismiss = guide.getByRole('button', { name: 'Ahora no', exact: true });
  if (await dismiss.isVisible().catch(() => false)) await dismiss.click();
}

async function openTactics(page) {
  await mockApi(page, {
    profileSeed: {
      'matthias.onboarded': '2',
      'chess-study-home-guide-dismissed-v1': '1',
    },
  });
  await login(page);
  await dismissGuide(page);
  const speech = page.getByRole('region', { name: 'Mensaje de Matthias', exact: true });
  if (await speech.isVisible().catch(() => false)) {
    const close = speech.getByRole('button', { name: 'Cerrar comentario de Matthias', exact: true });
    if (await close.isVisible().catch(() => false)) await close.click({ force: true });
  }
  const moreModes = await openMoreGameModes(page);
  await moreModes.getByRole('button').filter({ hasText: 'Experimentos geniales' }).click();
  await expect(page.getByRole('heading', { name: 'Experimentos geniales', exact: true })).toBeVisible();
  await page.getByRole('button').filter({ hasText: 'Abrir la mesa táctica' }).click();
  await expect(page.getByRole('heading', { name: 'Chronicles of Matthias Tactics', exact: true })).toBeVisible();
}

async function captureTacticsHealth(page) {
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
    const mode = document.querySelector('[data-chronicles-tactics="true"]');
    return {
      horizontalOverflow: root.scrollWidth > root.clientWidth + 1,
      camera: mode?.getAttribute('data-camera') || null,
      combat: mode?.getAttribute('data-combat') || null,
      canvasCount: document.querySelectorAll('[data-chronicles-tactics-renderer="three"] canvas').length,
      partyMemberCount: document.querySelectorAll('.chronicles-tactics__party [data-member-id]').length,
      mode: rect('[data-chronicles-tactics="true"]'),
      viewport: rect('.chronicles-tactics__viewport'),
      canvas: rect('[data-chronicles-tactics-renderer="three"] canvas'),
      mission: rect('.chronicles-tactics__mission'),
      party: rect('.chronicles-tactics__party'),
      actions: rect('.chronicles-tactics__actions'),
      narrator: rect('.chronicles-tactics__narrator'),
    };
  });
}

function expectCanvasFillsViewport(health, label) {
  expect(health.viewport, `${label}: viewport bounds`).not.toBeNull();
  expect(health.canvas, `${label}: canvas bounds`).not.toBeNull();
  expect(Math.abs(health.canvas.width - health.viewport.width), `${label}: canvas/viewport width`).toBeLessThanOrEqual(2);
  expect(Math.abs(health.canvas.height - health.viewport.height), `${label}: canvas/viewport height`).toBeLessThanOrEqual(2);
}

function expectDesktopCanonicalComposition(health, label) {
  const viewport = health.viewport;
  expect(viewport, `${label}: canonical viewport`).not.toBeNull();
  expect(health.mission, `${label}: mission panel`).not.toBeNull();
  expect(health.party, `${label}: party panel`).not.toBeNull();
  expect(health.actions, `${label}: action panel`).not.toBeNull();

  const midpoint = viewport.left + viewport.width / 2;
  expect(viewport.height, `${label}: battlefield remains dominant`).toBeGreaterThan(650);
  expect(health.mission.left, `${label}: mission stays on right`).toBeGreaterThan(midpoint);
  expect(health.mission.top, `${label}: mission stays near top`).toBeLessThan(viewport.top + 50);
  expect(health.mission.right, `${label}: mission stays inside viewport`).toBeLessThanOrEqual(viewport.right);

  expect(health.party.left, `${label}: party stays on left`).toBeLessThan(viewport.left + 50);
  expect(health.party.top, `${label}: party HUD stays near top`).toBeLessThan(viewport.top + 50);
  expect(health.party.right, `${label}: party leaves battlefield centre readable`).toBeLessThan(midpoint + 20);
  expect(health.party.bottom, `${label}: party HUD leaves lower battlefield readable`).toBeLessThan(viewport.bottom - 100);

  expect(health.actions.left, `${label}: actions stay in right band`).toBeGreaterThan(viewport.left + viewport.width * 0.68);
  expect(health.actions.right, `${label}: actions stay inside viewport`).toBeLessThanOrEqual(viewport.right);
}

async function captureElement(page, locator, path) {
  await locator.evaluate((node) => node.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'instant' }));
  await page.waitForTimeout(120);
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
  test(`Chronicles Tactics · visual proof · ${capture.label}`, async ({ browser }) => {
    test.setTimeout(150_000);
    await mkdir(ARTIFACT_DIR, { recursive: true });

    const context = await browser.newContext({
      viewport: { width: capture.width, height: capture.height },
      hasTouch: capture.hasTouch,
      isMobile: capture.hasTouch,
    });
    const page = await context.newPage();
    try {
      await openTactics(page);
      const mode = page.locator('[data-chronicles-tactics="true"]');
      const viewport = mode.locator('.chronicles-tactics__viewport');
      const canvas = mode.locator('[data-chronicles-tactics-renderer="three"] canvas');
      await expect(canvas).toHaveCount(1, { timeout: 30_000 });
      await expect(canvas).toBeVisible();
      await expect(viewport).toBeVisible();
      await expect(mode).toHaveAttribute('data-camera', 'isometric-behind-party');
      await expect(mode).toHaveAttribute('data-combat', 'realtime');
      await page.waitForTimeout(500);

      const health = await captureTacticsHealth(page);
      expect(health.horizontalOverflow, `${capture.label}: Tactics overflow`).toBe(false);
      expect(health.canvasCount, `${capture.label}: Tactics canvas`).toBe(1);
      expect(health.partyMemberCount, `${capture.label}: canonical four-member party`).toBe(4);
      expect(health.camera).toBe('isometric-behind-party');
      expect(health.combat).toBe('realtime');
      expect(health.viewport?.width || 0, `${capture.label}: Tactics viewport width`).toBeGreaterThan(0);
      expect(health.viewport?.height || 0, `${capture.label}: Tactics viewport height`).toBeGreaterThan(0);
      expect(health.canvas?.width || 0, `${capture.label}: Tactics canvas width`).toBeGreaterThan(0);
      expect(health.canvas?.height || 0, `${capture.label}: Tactics canvas height`).toBeGreaterThan(0);
      expectCanvasFillsViewport(health, capture.label);
      if (capture.width >= 1180) expectDesktopCanonicalComposition(health, capture.label);

      await captureElement(page, viewport, `${ARTIFACT_DIR}/chronicles-tactics-${capture.label}.png`);
      await writeFile(
        `${ARTIFACT_DIR}/chronicles-tactics-visual-health-${capture.label}.json`,
        `${JSON.stringify({ schema: 2, scope: 'chronicles-tactics', capture: { label: capture.label, ...health } }, null, 2)}\n`,
        'utf8',
      );
    } finally {
      await context.close();
    }
  });
}

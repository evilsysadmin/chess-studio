import { expect, test } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { login, mockApi, openMoreGameModes } from './helpers.js';

const ARTIFACT_DIR = '../.artifacts/app-visual';
const CAPTURES = [
  { label: 'desktop-1440x900', width: 1440, height: 900, hasTouch: false },
  { label: 'android-390x844', width: 390, height: 844, hasTouch: true },
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
  await page.getByRole('button').filter({ hasText: 'Descender a la cripta' }).click();
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
      portraitCanvasCount: document.querySelectorAll('[data-chronicles-party-renderer="three"] canvas').length,
      stage: rect('.chronicles-stage'),
      gameCanvas: rect('[data-chronicles-renderer="three"] canvas'),
      portraitCanvas: rect('[data-chronicles-party-renderer="three"] canvas'),
    };
  });
}

async function stageChroniclesSigilAwake(page) {
  const forward = page.getByRole('button', { name: 'Avanzar', exact: true });
  const attack = page.getByRole('button', { name: 'Atacar', exact: true });
  await forward.click();
  await page.getByRole('button', { name: 'Seleccionar Hildegard', exact: true }).click();
  for (let hit = 0; hit < 3; hit += 1) await attack.click();
  await forward.click();
  await page.getByRole('button', { name: 'Girar a la izquierda', exact: true }).click();
  await forward.click();
  await expect(page.getByText('Derrota a la torre carcelero', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Retroceder', exact: true }).click();
  await page.waitForTimeout(220);
}

async function captureElement(page, locator, path) {
  await locator.scrollIntoViewIfNeeded({ timeout: 20_000 });
  await page.waitForTimeout(100);
  const box = await locator.boundingBox();
  expect(box, `${path}: capture bounds`).not.toBeNull();
  const scroll = await page.evaluate(() => ({ x: window.scrollX, y: window.scrollY }));
  await page.screenshot({
    path,
    animations: 'disabled',
    timeout: 30_000,
    clip: {
      x: Math.max(0, box.x + scroll.x),
      y: Math.max(0, box.y + scroll.y),
      width: Math.max(1, box.width),
      height: Math.max(1, box.height),
    },
  });
}

for (const capture of CAPTURES) {
  test(`Chronicles · gameplay visual · ${capture.label}`, async ({ browser }) => {
    // The stage is the visual contract. Capture it directly instead of forcing
    // a full-page WebGL readback, and give each viewport an independent budget.
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
      const portraitCanvas = page.locator('[data-chronicles-party-renderer="three"] canvas');
      const stage = page.locator('.chronicles-stage');
      await expect(chroniclesCanvas).toHaveCount(1, { timeout: 20_000 });
      await expect(chroniclesCanvas).toBeVisible();
      await expect(portraitCanvas).toHaveCount(1, { timeout: 20_000 });
      await expect(portraitCanvas).toBeVisible();
      await expect(stage).toBeVisible();
      await page.waitForTimeout(450);

      const health = await captureChroniclesHealth(page);
      expect(health.horizontalOverflow, `${capture.label}: Chronicles overflow`).toBe(false);
      expect(health.gameCanvasCount, `${capture.label}: Chronicles dungeon canvas`).toBe(1);
      expect(health.portraitCanvasCount, `${capture.label}: Chronicles portrait canvas`).toBe(1);
      expect(health.stage?.width || 0, `${capture.label}: Chronicles stage visible`).toBeGreaterThan(0);
      expect(health.gameCanvas?.width || 0, `${capture.label}: Chronicles dungeon canvas visible`).toBeGreaterThan(0);
      expect(health.gameCanvas?.height || 0, `${capture.label}: Chronicles dungeon canvas height`).toBeGreaterThan(0);
      expect(health.portraitCanvas?.width || 0, `${capture.label}: Chronicles portrait visible`).toBeGreaterThan(0);
      expect(health.portraitCanvas?.height || 0, `${capture.label}: Chronicles portrait height`).toBeGreaterThan(0);

      await captureElement(page, stage, `${ARTIFACT_DIR}/chronicles-playing-${capture.label}.png`);
      await stageChroniclesSigilAwake(page);
      await captureElement(page, stage, `${ARTIFACT_DIR}/chronicles-sigil-awake-${capture.label}.png`);
      await writeFile(
        `${ARTIFACT_DIR}/chronicles-visual-health-${capture.label}.json`,
        `${JSON.stringify({ schema: 2, scope: 'chronicles', capture: { label: capture.label, ...health } }, null, 2)}\n`,
        'utf8',
      );
    } finally {
      await context.close();
    }
  });
}

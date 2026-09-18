import { expect, test } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { login, mockApi } from './helpers.js';

const ARTIFACT_DIR = '../.artifacts/app-visual';
const CAPTURES = [
  { label: 'desktop-1440x900', width: 1440, height: 900, hasTouch: false },
  { label: 'android-390x844', width: 390, height: 844, hasTouch: true },
  { label: 'android-landscape-844x390', width: 844, height: 390, hasTouch: true },
];

async function dismissHomeOverlays(page) {
  const guide = page.getByRole('region', { name: 'Guía rápida de Chess Studio' });
  if (await guide.isVisible().catch(() => false)) {
    const dismiss = guide.getByRole('button', { name: 'Ahora no', exact: true });
    const close = guide.getByRole('button', { name: 'Cerrar guía rápida', exact: true });
    if (await dismiss.isVisible().catch(() => false)) await dismiss.click();
    else if (await close.isVisible().catch(() => false)) await close.click();
  }

  const speech = page.getByRole('region', { name: 'Mensaje de Matthias', exact: true });
  if (await speech.isVisible().catch(() => false)) {
    const close = speech.getByRole('button', { name: 'Cerrar comentario de Matthias', exact: true });
    if (await close.isVisible().catch(() => false)) await close.click({ force: true });
  }
}

async function openPawnSlug(page) {
  await mockApi(page, {
    profileSeed: {
      'matthias.onboarded': '2',
      'chess-study-home-guide-dismissed-v1': '1',
    },
  });
  await login(page);
  await dismissHomeOverlays(page);

  const direct = page.getByRole('button', { name: 'Abrir Pawn Slug directamente', exact: true });
  await expect(direct).toBeVisible({ timeout: 20_000 });
  // Keyboard activation deliberately avoids coupling visual proof to the current
  // Home pointer hit-map. Home interaction geometry has its own E2E ownership.
  await direct.focus();
  await page.keyboard.press('Enter');

  await expect(page.getByRole('heading', { name: 'PAWN SLUG GODOT', exact: true })).toBeVisible();
  const frame = page.locator('iframe[title="Pawn Slug Godot"]');
  await expect(frame).toBeVisible();
  await expect(page.getByText('Godot listo', { exact: true })).toBeVisible({ timeout: 35_000 });
  const canvas = page.frameLocator('iframe[title="Pawn Slug Godot"]').locator('canvas');
  await expect(canvas).toBeVisible({ timeout: 15_000 });
  await page.waitForTimeout(180);
}

async function health(page, label) {
  return page.evaluate((captureLabel) => {
    const root = document.documentElement;
    const rect = (selector) => {
      const node = document.querySelector(selector);
      if (!node) return null;
      const box = node.getBoundingClientRect();
      return {
        left: Number(box.left.toFixed(1)),
        top: Number(box.top.toFixed(1)),
        right: Number(box.right.toFixed(1)),
        bottom: Number(box.bottom.toFixed(1)),
        width: Number(box.width.toFixed(1)),
        height: Number(box.height.toFixed(1)),
      };
    };
    return {
      label: captureLabel,
      viewport: { width: window.innerWidth, height: window.innerHeight },
      horizontalOverflow: root.scrollWidth > root.clientWidth + 1,
      host: rect('.pawn-slug-godot-host'),
      header: rect('.pawn-slug-godot-host__header'),
      shell: rect('.pawn-slug-godot-host__frame-shell'),
      frame: rect('iframe[title="Pawn Slug Godot"]'),
      legacyThreeCount: document.querySelectorAll('[data-pawn-slug-renderer="three"]').length,
    };
  }, label);
}

test('Pawn Slug Godot · evidencia visual desktop + portrait + landscape', async ({ browser }) => {
  test.setTimeout(180_000);
  await mkdir(ARTIFACT_DIR, { recursive: true });
  const captures = [];

  for (const capture of CAPTURES) {
    const context = await browser.newContext({
      viewport: { width: capture.width, height: capture.height },
      hasTouch: capture.hasTouch,
      isMobile: capture.hasTouch,
    });
    const page = await context.newPage();
    try {
      await openPawnSlug(page);
      const snapshot = await health(page, capture.label);
      captures.push(snapshot);

      expect(snapshot.horizontalOverflow, `${capture.label}: horizontal overflow`).toBe(false);
      expect(snapshot.legacyThreeCount, `${capture.label}: legacy Three renderer`).toBe(0);
      expect(snapshot.frame?.width || 0, `${capture.label}: iframe visible`).toBeGreaterThan(0);

      if (capture.label === 'android-390x844') {
        const ratio = (snapshot.frame?.height || 0) / Math.max(1, snapshot.frame?.width || 1);
        expect(ratio, 'portrait host stays compact 16:9 before rotation').toBeGreaterThan(0.52);
        expect(ratio, 'portrait host stays compact 16:9 before rotation').toBeLessThan(0.60);
      }

      if (capture.label === 'android-landscape-844x390') {
        expect(snapshot.frame.left, 'landscape iframe left edge').toBeGreaterThanOrEqual(-1);
        expect(snapshot.frame.right, 'landscape iframe right edge').toBeLessThanOrEqual(845);
        expect(snapshot.frame.height, 'landscape iframe fills viewport height').toBeGreaterThanOrEqual(388);
      }

      await page.screenshot({
        path: `${ARTIFACT_DIR}/pawn-slug-godot-${capture.label}.png`,
        fullPage: true,
      });
    } finally {
      await context.close();
    }
  }

  await writeFile(
    `${ARTIFACT_DIR}/pawn-slug-visual-health.json`,
    `${JSON.stringify({ schema: 4, scope: 'pawnslug-godot', captures }, null, 2)}\n`,
    'utf8',
  );
});

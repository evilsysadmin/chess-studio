import { expect, test } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { login, mockApi, openMoreGameModes } from './helpers.js';

const ARTIFACT_DIR = '../.artifacts/app-visual';
const CAPTURES = [
  { label: 'desktop-1440x900', width: 1440, height: 900, hasTouch: false },
  { label: 'android-390x844', width: 390, height: 844, hasTouch: true },
];

async function dismissMatthiasSpeech(page) {
  const speech = page.getByRole('region', { name: 'Mensaje de Matthias', exact: true });
  if (!(await speech.isVisible().catch(() => false))) return;
  const close = speech.getByRole('button', { name: 'Cerrar comentario de Matthias', exact: true });
  if (await close.isVisible().catch(() => false)) await close.click({ force: true });
}

async function openExperiments(page) {
  await mockApi(page, {
    profileSeed: {
      'matthias.onboarded': '2',
      'chess-study-home-guide-dismissed-v1': '1',
    },
  });
  await login(page);
  await dismissMatthiasSpeech(page);
  await openMoreGameModes(page);

  const tools = page.locator('#illustrated-home-tools');
  await expect(tools).toBeVisible();
  await tools.getByRole('button').filter({ hasText: 'Experimentos geniales' }).click();
  await expect(page.getByRole('heading', { name: 'Experimentos geniales', exact: true })).toBeVisible();
}

async function freezeVisualFrame(page) {
  await page.addStyleTag({
    content: '*, *::before, *::after { animation: none !important; transition: none !important; caret-color: transparent !important; }',
  });
  await page.waitForTimeout(80);
}

async function captureHealth(page, label) {
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
      arcadeZone: rect('.lab-arcade-zone'),
      pawnSlug: rect('.lab-arcade-launch.is-pawnslug'),
      trailblazer: rect('.lab-arcade-launch.is-trailblazer'),
      tacticalDeck: rect('.experiments-tactical-deck'),
      genericCardsInsideArcade: document.querySelectorAll('.lab-arcade-zone .experiments-card').length,
    };
  }, label);
}

async function capturePawnSlugReadyHealth(page) {
  return page.evaluate(() => {
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
    const pawnSlugRoot = document.querySelector('[data-pawn-slug="true"]');
    return {
      horizontalOverflow: root.scrollWidth > root.clientWidth + 1,
      expert: pawnSlugRoot?.getAttribute('data-pawn-slug-expert') || null,
      canvasCount: document.querySelectorAll('[data-pawn-slug-renderer="three"] canvas').length,
      cabinet: rect('.pawn-slug-cabinet'),
      overlay: rect('.pawn-slug-overlay'),
      settingsTrigger: rect('.pawn-slug-settings-trigger'),
    };
  });
}

test('Experimentos + Pawn Slug ready · canary visual desktop + Android', async ({ browser }) => {
  test.setTimeout(90_000);
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
      await openExperiments(page);

      const arcade = page.locator('.lab-arcade-zone');
      const pawnSlug = arcade.getByRole('button', { name: /Pawn Slug/ });
      const trailblazer = arcade.getByRole('button', { name: /Pawn Trailblazer/ });
      await expect(arcade).toBeVisible();
      await expect(pawnSlug).toBeVisible();
      await expect(trailblazer).toBeVisible();
      await expect(page.locator('.experiments-tactical-deck')).toBeVisible();
      await expect(arcade.locator('.experiments-card')).toHaveCount(0);

      const health = await captureHealth(page, capture.label);
      captures.push(health);
      expect(health.horizontalOverflow, `${capture.label}: horizontal overflow`).toBe(false);
      expect(health.genericCardsInsideArcade, `${capture.label}: Arcade regressed to generic cards`).toBe(0);
      expect(health.pawnSlug?.width || 0, `${capture.label}: Pawn Slug visible width`).toBeGreaterThan(0);
      expect(health.trailblazer?.width || 0, `${capture.label}: Trailblazer visible width`).toBeGreaterThan(0);

      if (capture.hasTouch) {
        expect(health.trailblazer.top, `${capture.label}: Trailblazer stacked below Pawn Slug`).toBeGreaterThan(health.pawnSlug.top);
        expect(Math.abs(health.pawnSlug.width - health.trailblazer.width), `${capture.label}: stacked Arcade widths`).toBeLessThanOrEqual(2);
        expect(health.pawnSlug.height, `${capture.label}: Pawn Slug touch target`).toBeGreaterThanOrEqual(44);
        expect(health.trailblazer.height, `${capture.label}: Trailblazer touch target`).toBeGreaterThanOrEqual(44);
      } else {
        expect(health.pawnSlug.width, `${capture.label}: Pawn Slug remains the primary operation`).toBeGreaterThan(health.trailblazer.width * 1.5);
        expect(Math.abs(health.pawnSlug.top - health.trailblazer.top), `${capture.label}: desktop Arcade alignment`).toBeLessThanOrEqual(2);
      }

      await freezeVisualFrame(page);
      await page.screenshot({
        path: `${ARTIFACT_DIR}/experiments-${capture.label}.png`,
        fullPage: true,
      });

      await pawnSlug.click();
      await expect(page.getByRole('heading', { name: 'Pawn Slug', exact: true })).toBeVisible();
      const root = page.locator('[data-pawn-slug="true"]');
      const start = page.getByRole('button', { name: 'INICIAR OPERACIÓN', exact: true });
      await expect(root).toHaveAttribute('data-pawn-slug-expert', 'false');
      await expect(start).toBeVisible();
      await expect(page.getByText(/Sin XP, niveles ni economía/)).toBeVisible();
      await expect(page.locator('[data-pawn-slug-renderer="three"] canvas')).toHaveCount(0);

      const readyHealth = await capturePawnSlugReadyHealth(page);
      health.pawnSlugReady = readyHealth;
      expect(readyHealth.horizontalOverflow, `${capture.label}: Pawn Slug ready overflow`).toBe(false);
      expect(readyHealth.expert, `${capture.label}: Pawn Slug default mode`).toBe('false');
      expect(readyHealth.canvasCount, `${capture.label}: ready screen must stay boot-free`).toBe(0);
      expect(readyHealth.cabinet?.width || 0, `${capture.label}: Pawn Slug cabinet visible`).toBeGreaterThan(0);
      expect(readyHealth.overlay?.width || 0, `${capture.label}: mission overlay visible`).toBeGreaterThan(0);
      expect(readyHealth.settingsTrigger?.width || 0, `${capture.label}: Settings trigger visible`).toBeGreaterThan(0);
      const startBox = await start.boundingBox();
      expect(startBox, `${capture.label}: start action bounds`).not.toBeNull();
      expect(startBox.height, `${capture.label}: start action touch height`).toBeGreaterThanOrEqual(44);

      await freezeVisualFrame(page);
      await page.screenshot({
        path: `${ARTIFACT_DIR}/pawn-slug-ready-${capture.label}.png`,
        fullPage: true,
      });
    } finally {
      await context.close();
    }
  }

  await writeFile(
    `${ARTIFACT_DIR}/experiments-visual-health.json`,
    `${JSON.stringify({ schema: 1, captures }, null, 2)}\n`,
    'utf8',
  );
});

import { expect, test } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { login, mockApi, openMoreGameModes } from './helpers.js';

const ARTIFACT_DIR = '../.artifacts/app-visual';
const CAPTURES = [
  { label: 'desktop-1440x900', width: 1440, height: 900, hasTouch: false },
  { label: 'android-390x844', width: 390, height: 844, hasTouch: true },
];
const VALID_SCOPES = new Set(['all', 'landing', 'chronicles', 'pawnslug']);
const REQUESTED_SCOPES = new Set(
  String(process.env.APP_VISUAL_EXPERIMENTS_SCOPE || 'all')
    .split(',')
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean),
);
for (const scope of REQUESTED_SCOPES) {
  if (!VALID_SCOPES.has(scope)) throw new Error(`Unknown APP_VISUAL_EXPERIMENTS_SCOPE value: ${scope}`);
}
const scopeEnabled = (scope) => REQUESTED_SCOPES.has('all') || REQUESTED_SCOPES.has(scope);

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

async function withCapturePage(browser, capture, callback) {
  const context = await browser.newContext({
    viewport: { width: capture.width, height: capture.height },
    hasTouch: capture.hasTouch,
    isMobile: capture.hasTouch,
  });
  const page = await context.newPage();
  try {
    await openExperiments(page);
    return await callback(page);
  } finally {
    await context.close();
  }
}

async function captureFrozenFrame(page, options) {
  const style = await page.addStyleTag({
    content: '*, *::before, *::after { animation: none !important; transition: none !important; caret-color: transparent !important; }',
  });
  try {
    await page.waitForTimeout(80);
    await page.screenshot(options);
  } finally {
    await style.evaluate((node) => node.remove()).catch(() => {});
  }
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

async function captureChroniclesHealth(page) {
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

async function capturePawnSlugPlayingHealth(page) {
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
    return {
      horizontalOverflow: root.scrollWidth > root.clientWidth + 1,
      canvasCount: document.querySelectorAll('[data-pawn-slug-renderer="three"] canvas').length,
      overlayCount: document.querySelectorAll('.pawn-slug-overlay').length,
      stage: rect('.pawn-slug-stage'),
      canvas: rect('[data-pawn-slug-renderer="three"] canvas'),
      hud: rect('.pawn-slug-hud'),
      health: rect('.pawn-slug-health-track'),
      missionProgress: rect('.pawn-slug-mission-progress'),
      settingsTrigger: rect('.pawn-slug-settings-trigger'),
      touchControls: rect('.pawn-slug-touch'),
    };
  });
}

if (scopeEnabled('landing')) {
  test('Experimentos · landing visual desktop + Android', async ({ browser }) => {
    test.setTimeout(75_000);
    await mkdir(ARTIFACT_DIR, { recursive: true });

    const captures = [];
    for (const capture of CAPTURES) {
      await withCapturePage(browser, capture, async (page) => {
        const chronicles = page.getByRole('button', { name: /Chronicles of Matthias/ });
        const arcade = page.locator('.lab-arcade-zone');
        const pawnSlug = arcade.getByRole('button', { name: /Pawn Slug/ });
        const trailblazer = arcade.getByRole('button', { name: /Pawn Trailblazer/ });
        await expect(chronicles).toBeVisible();
        await expect(arcade).toBeVisible();
        await expect(pawnSlug).toBeVisible();
        await expect(trailblazer).toBeVisible();
        await expect(page.locator('.experiments-tactical-deck').first()).toBeVisible();
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

        await captureFrozenFrame(page, {
          path: `${ARTIFACT_DIR}/experiments-${capture.label}.png`,
          fullPage: true,
        });
      });
    }

    await writeFile(
      `${ARTIFACT_DIR}/experiments-visual-health.json`,
      `${JSON.stringify({ schema: 2, scope: 'landing', captures }, null, 2)}\n`,
      'utf8',
    );
  });
}

if (scopeEnabled('chronicles')) {
  test('Chronicles · gameplay visual desktop + Android', async ({ browser }) => {
    // This visual proof renders two full Three.js sessions plus an authored combat state.
    // Keep interaction/assertion timeouts strict; widen only its total hosted wall clock.
    test.setTimeout(240_000);
    await mkdir(ARTIFACT_DIR, { recursive: true });

    const captures = [];
    for (const capture of CAPTURES) {
      await withCapturePage(browser, capture, async (page) => {
        const chronicles = page.getByRole('button', { name: /Chronicles of Matthias/ });
        await expect(chronicles).toBeVisible();
        await chronicles.click();
        await expect(page.getByRole('heading', { name: 'Chronicles of Matthias', exact: true })).toBeVisible();
        const chroniclesCanvas = page.locator('[data-chronicles-renderer="three"] canvas');
        const portraitCanvas = page.locator('[data-chronicles-party-renderer="three"] canvas');
        await expect(chroniclesCanvas).toHaveCount(1, { timeout: 20_000 });
        await expect(chroniclesCanvas).toBeVisible();
        await expect(portraitCanvas).toHaveCount(1, { timeout: 20_000 });
        await expect(portraitCanvas).toBeVisible();
        await page.waitForTimeout(450);

        const health = await captureChroniclesHealth(page);
        captures.push({ label: capture.label, ...health });
        expect(health.horizontalOverflow, `${capture.label}: Chronicles overflow`).toBe(false);
        expect(health.gameCanvasCount, `${capture.label}: Chronicles dungeon canvas`).toBe(1);
        expect(health.portraitCanvasCount, `${capture.label}: Chronicles portrait canvas`).toBe(1);
        expect(health.stage?.width || 0, `${capture.label}: Chronicles stage visible`).toBeGreaterThan(0);
        expect(health.gameCanvas?.width || 0, `${capture.label}: Chronicles dungeon canvas visible`).toBeGreaterThan(0);
        expect(health.gameCanvas?.height || 0, `${capture.label}: Chronicles dungeon canvas height`).toBeGreaterThan(0);
        expect(health.portraitCanvas?.width || 0, `${capture.label}: Chronicles portrait visible`).toBeGreaterThan(0);
        expect(health.portraitCanvas?.height || 0, `${capture.label}: Chronicles portrait height`).toBeGreaterThan(0);

        await captureFrozenFrame(page, {
          path: `${ARTIFACT_DIR}/chronicles-playing-${capture.label}.png`,
          fullPage: true,
        });

        await stageChroniclesSigilAwake(page);
        await captureFrozenFrame(page, {
          path: `${ARTIFACT_DIR}/chronicles-sigil-awake-${capture.label}.png`,
          fullPage: true,
        });
      });
    }

    await writeFile(
      `${ARTIFACT_DIR}/chronicles-visual-health.json`,
      `${JSON.stringify({ schema: 1, scope: 'chronicles', captures }, null, 2)}\n`,
      'utf8',
    );
  });
}

if (scopeEnabled('pawnslug')) {
  test('Pawn Slug Godot · host visual desktop + Android', async ({ browser }) => {
    test.setTimeout(120_000);
    await mkdir(ARTIFACT_DIR, { recursive: true });

    const captures = [];
    const pawnSlugCaptures = [
      ...CAPTURES,
      { label: 'android-landscape-844x390', width: 844, height: 390, hasTouch: true },
    ];
    for (const capture of pawnSlugCaptures) {
      await withCapturePage(browser, capture, async (page) => {
        const godot = page.getByRole('button', { name: /PAWN SLUG GODOT/i });
        await expect(godot).toBeVisible();
        await godot.click();

        await expect(page.getByRole('heading', { name: 'PAWN SLUG GODOT', exact: true })).toBeVisible();
        const frame = page.locator('iframe[title="Pawn Slug Godot"]');
        await expect(frame).toBeVisible();
        await expect(page.getByText('Godot listo', { exact: true })).toBeVisible({ timeout: 35_000 });
        const godotCanvas = page.frameLocator('iframe[title="Pawn Slug Godot"]').locator('canvas');
        await expect(godotCanvas).toBeVisible({ timeout: 15_000 });
        await page.waitForTimeout(180);

        const health = await page.evaluate(() => {
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
            horizontalOverflow: root.scrollWidth > root.clientWidth + 1,
            host: rect('.pawn-slug-godot-host'),
            shell: rect('.pawn-slug-godot-host__frame-shell'),
            frame: rect('iframe[title="Pawn Slug Godot"]'),
            legacyThreeCount: document.querySelectorAll('[data-pawn-slug-renderer="three"]').length,
          };
        });

        captures.push({ label: capture.label, ...health });
        expect(health.horizontalOverflow, `${capture.label}: Pawn Slug Godot overflow`).toBe(false);
        expect(health.legacyThreeCount, `${capture.label}: legacy Three renderer must stay retired`).toBe(0);
        expect(health.host?.width || 0, `${capture.label}: Godot host visible`).toBeGreaterThan(0);
        expect(health.shell?.width || 0, `${capture.label}: Godot frame shell visible`).toBeGreaterThan(0);
        expect(health.frame?.width || 0, `${capture.label}: Godot iframe visible`).toBeGreaterThan(0);
        if (capture.hasTouch) {
          expect(health.frame.left, `${capture.label}: iframe stays inside left edge`).toBeGreaterThanOrEqual(-1);
          expect(health.frame.right, `${capture.label}: iframe stays inside right edge`).toBeLessThanOrEqual(capture.width + 1);
        }

        await captureFrozenFrame(page, {
          path: `${ARTIFACT_DIR}/pawn-slug-godot-${capture.label}.png`,
          fullPage: true,
        });
      });
    }

    await writeFile(
      `${ARTIFACT_DIR}/pawn-slug-visual-health.json`,
      `${JSON.stringify({ schema: 3, scope: 'pawnslug-godot', captures }, null, 2)}\n`,
      'utf8',
    );
  });
}

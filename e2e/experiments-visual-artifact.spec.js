import { expect, test } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { login, mockApi, openMoreGameModes } from './helpers.js';

const ARTIFACT_DIR = '../.artifacts/app-visual';
const CAPTURES = [
  { label: 'desktop-1440x900', width: 1440, height: 900, hasTouch: false },
  { label: 'android-390x844', width: 390, height: 844, hasTouch: true },
];
const VALID_SCOPES = new Set(['all', 'landing', 'chronicles', 'pawnslug', 'football']);
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

async function withPawnSlugCapturePage(browser, capture, callback) {
  const context = await browser.newContext({
    viewport: { width: capture.width, height: capture.height },
    hasTouch: capture.hasTouch,
    isMobile: capture.hasTouch,
  });
  const page = await context.newPage();
  try {
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
    const portal = page.locator('.lab-workshop-portal--pawnslug-godot');
    await expect(portal).toBeVisible({ timeout: 20_000 });
    await portal.click();
    return await callback(page);
  } finally {
    await context.close();
  }
}

async function withChessFootballCapturePage(browser, capture, callback) {
  const context = await browser.newContext({
    viewport: { width: capture.width, height: capture.height },
    hasTouch: true,
    isMobile: true,
  });
  const page = await context.newPage();
  try {
    await page.addInitScript(() => {
      const nativeMatchMedia = window.matchMedia.bind(window);
      window.matchMedia = (query) => {
        if (query !== '(pointer: coarse)') return nativeMatchMedia(query);
        return {
          matches: true,
          media: query,
          onchange: null,
          addListener() {},
          removeListener() {},
          addEventListener() {},
          removeEventListener() {},
          dispatchEvent() { return true; },
        };
      };
      Element.prototype.requestFullscreen = function requestFullscreen() {
        return Promise.resolve();
      };
      try {
        Object.defineProperty(Screen.prototype, 'orientation', {
          configurable: true,
          get() {
            return {
              lock() { return Promise.resolve(); },
              unlock() {},
            };
          },
        });
      } catch {
        // The host gate is still deterministic from viewport + coarse pointer.
      }
    });
    const release = '0123456789abcdef';
    const indexUrl = `https://assets.chess-studio.shadowops.dpdns.org/chess-football-godot/releases/${release}/index.html`;
    await page.route('**/chess-football-godot/current.json**', (route) => route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        version: 1,
        release,
        sourceSha: 'a'.repeat(40),
        index: indexUrl,
      }),
    }));
    await page.route(indexUrl, (route) => route.fulfill({
      status: 200,
      contentType: 'text/html',
      body: '<!doctype html><html><body style="margin:0;background:#060a07;color:#eee2bd"><main>Chess Football mock runtime</main></body></html>',
    }));
    await openExperiments(page);
    const portal = page.locator('.lab-workshop-portal--football');
    await expect(portal).toBeVisible();
    await portal.click();
    await expect(page.locator('.chess-football-godot-host')).toBeVisible();
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
      arcadeZone: rect('.lab-workshop-wing--hangar'),
      pawnSlug: rect('.lab-workshop-portal--pawnslug-godot'),
      trailblazer: rect('.lab-workshop-portal--trailblazer'),
      tacticalDeck: rect('.lab-workshop-wing--ops'),
      genericCardsInsideArcade: document.querySelectorAll('.lab-workshop-wing--hangar .experiments-card').length,
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
  await page.keyboard.press('2');
  await expect(page.getByRole('button', { name: 'Seleccionar Hildegard', exact: true })).toHaveAttribute('aria-pressed', 'true');
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
        const chronicles = page.locator('.lab-workshop-portal--chronicles');
        const arcade = page.locator('.lab-workshop-wing--hangar');
        const pawnSlug = page.locator('.lab-workshop-portal--pawnslug-godot');
        const trailblazer = page.locator('.lab-workshop-portal--trailblazer');
        await expect(chronicles).toBeVisible();
        await expect(arcade).toBeVisible();
        await expect(pawnSlug).toBeVisible();
        await expect(trailblazer).toBeVisible();
        await expect(page.locator('.lab-workshop-wing--ops')).toBeVisible();
        await expect(arcade.locator('.experiments-card')).toHaveCount(0);

        const health = await captureHealth(page, capture.label);
        captures.push(health);
        expect(health.horizontalOverflow, `${capture.label}: horizontal overflow`).toBe(false);
        expect(health.genericCardsInsideArcade, `${capture.label}: Arcade regressed to generic cards`).toBe(0);
        expect(health.pawnSlug?.width || 0, `${capture.label}: Pawn Slug visible width`).toBeGreaterThan(0);
        expect(health.trailblazer?.width || 0, `${capture.label}: Trailblazer visible width`).toBeGreaterThan(0);

        if (capture.hasTouch) {
          expect(health.trailblazer.top, `${capture.label}: Trailblazer stacked below Pawn Slug`).toBeGreaterThan(health.pawnSlug.top);
          // Mobile dungeon plaques deliberately vary in width so the room does not
          // collapse back into a symmetric dashboard grid. Keep both comfortably
          // larger than the minimum touch target instead of enforcing equality.
          expect(health.pawnSlug.width, `${capture.label}: Pawn Slug mobile plaque width`).toBeGreaterThanOrEqual(120);
          expect(health.trailblazer.width, `${capture.label}: Trailblazer mobile plaque width`).toBeGreaterThanOrEqual(120);
          expect(health.pawnSlug.height, `${capture.label}: Pawn Slug touch target`).toBeGreaterThanOrEqual(44);
          expect(health.trailblazer.height, `${capture.label}: Trailblazer touch target`).toBeGreaterThanOrEqual(44);
        } else {
          expect(Math.abs(health.pawnSlug.width - health.trailblazer.width), `${capture.label}: Workshop portal widths`).toBeLessThanOrEqual(2);
          expect(health.trailblazer.top, `${capture.label}: Trailblazer remains below Pawn Slug`).toBeGreaterThan(health.pawnSlug.top);
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

if (scopeEnabled('football')) {
  test('Chess Football · mobile host visual portrait + landscape', async ({ browser }) => {
    test.setTimeout(90_000);
    await mkdir(ARTIFACT_DIR, { recursive: true });

    const captures = [];
    const footballCaptures = [
      { label: 'android-portrait-390x844', width: 390, height: 844, portrait: true },
      { label: 'android-landscape-844x390', width: 844, height: 390, portrait: false },
    ];

    for (const capture of footballCaptures) {
      await withChessFootballCapturePage(browser, capture, async (page) => {
        const host = page.locator('.chess-football-godot-host');
        const frame = page.locator('iframe[title="Chess Football Godot"]');
        await expect(frame).toBeVisible();
        await expect(host).toHaveAttribute('data-runtime-ready', 'true');
        await expect(host).toHaveAttribute('data-mobile-portrait', capture.portrait ? 'true' : 'false');

        if (capture.portrait) {
          await expect(page.getByRole('heading', { name: 'Gira el móvil' })).toBeVisible();
          await expect(page.getByRole('button', { name: 'Activar apaisado' })).toBeVisible();
          await expect(page.getByRole('button', { name: 'Salir de Chess Football' })).toBeVisible();
        } else {
          await expect(page.getByRole('heading', { name: 'Gira el móvil' })).toHaveCount(0);
          await expect(page.getByRole('button', { name: 'Salir de Chess Football' })).toBeVisible();
        }

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
            host: rect('.chess-football-godot-host'),
            portraitGate: rect('.chess-football-godot-host__portrait-gate'),
            mobileExit: rect('.chess-football-godot-host__mobile-exit'),
          };
        });
        captures.push({ label: capture.label, ...health });
        expect(health.horizontalOverflow, `${capture.label}: horizontal overflow`).toBe(false);
        expect(health.host?.width || 0, `${capture.label}: host visible`).toBeGreaterThanOrEqual(capture.width - 1);
        expect(health.host?.height || 0, `${capture.label}: host height`).toBeGreaterThanOrEqual(capture.height - 1);
        if (capture.portrait) {
          expect(health.portraitGate?.width || 0, `${capture.label}: portrait gate visible`).toBeGreaterThan(0);
        } else {
          expect(health.mobileExit?.width || 0, `${capture.label}: landscape escape visible`).toBeGreaterThanOrEqual(44);
          expect(health.mobileExit?.height || 0, `${capture.label}: landscape escape touch target`).toBeGreaterThanOrEqual(44);
        }

        await captureFrozenFrame(page, {
          path: `${ARTIFACT_DIR}/chess-football-${capture.label}.png`,
          fullPage: true,
        });
      });
    }

    await writeFile(
      `${ARTIFACT_DIR}/chess-football-visual-health.json`,
      `${JSON.stringify({ schema: 1, scope: 'football', captures }, null, 2)}\n`,
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
        await expect(page.locator('[data-chronicles="true"]')).toBeVisible();
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
      await withPawnSlugCapturePage(browser, capture, async (page) => {
        await expect(page.locator('.pawn-slug-godot-host')).toBeVisible();
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

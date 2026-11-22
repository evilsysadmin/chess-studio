import { expect, test } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { login, mockApi, openMoreGameModes } from './helpers.js';

const ARTIFACT_DIR = '../.artifacts/app-visual';
const CAPTURES = [
  { label: 'desktop-1440x900', width: 1440, height: 900, hasTouch: false },
  { label: 'android-390x844', width: 390, height: 844, hasTouch: true },
];
const LAB_CAPTURES = [
  CAPTURES[0],
  { label: 'android-360x800', width: 360, height: 800, hasTouch: true },
  CAPTURES[1],
  { label: 'android-430x932', width: 430, height: 932, hasTouch: true },
];
const LANDING_CAPTURES = [
  ...CAPTURES,
  { label: 'android-landscape-915x412', width: 915, height: 412, hasTouch: true },
  { label: 'android-desktop-site-1536x709', width: 1536, height: 709, hasTouch: true },
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
  for (let attempt = 0; attempt < 5; attempt += 1) {
    if (!(await speech.isVisible().catch(() => false))) return;
    // Visual capture setup: dispatch the real DOM button click synchronously.
    // Playwright's actionability wait can outlive a Matthias re-render and
    // time out while the speech region is still transitioning.
    const state = await page.evaluate(() => {
      const bubble = document.querySelector('.illustrated-home__speech[aria-label="Mensaje de Matthias"]');
      if (!bubble) return 'gone';
      const close = bubble.querySelector('button[aria-label="Cerrar comentario de Matthias"]');
      if (!close) return 'pending';
      close.click();
      return 'clicked';
    });
    if (state === 'gone') return;
    await expect(speech).toBeHidden({ timeout: 600 }).catch(() => {});
  }
  // A persistent speech bubble with no working close button is a real failure.
  await expect(speech).toBeHidden({ timeout: 1_500 });
}

test('Matthias visual setup waits for a transiently missing close button', async ({ page }) => {
  await page.setContent('<section class="illustrated-home__speech" role="region" aria-label="Mensaje de Matthias">Comentario visible de Matthias</section>');
  await page.evaluate(() => {
    const bubble = document.querySelector('.illustrated-home__speech');
    setTimeout(() => {
      const close = document.createElement('button');
      close.setAttribute('aria-label', 'Cerrar comentario de Matthias');
      close.addEventListener('click', () => bubble.remove());
      bubble.append(close);
    }, 150);
  });
  await dismissMatthiasSpeech(page);
  await expect(page.getByRole('region', { name: 'Mensaje de Matthias', exact: true })).toHaveCount(0);
});

async function openExperiments(page, profileSeed = {}) {
  await mockApi(page, {
    profileSeed: {
      'matthias.onboarded': '2',
      'chess-study-home-guide-dismissed-v1': '1',
      ...profileSeed,
    },
    // Fresh first-person runs now start in the authored Swordhaven settlement.
    chroniclesCurrentMapId: 'swordhaven-square',
  });
  await login(page);
  await dismissMatthiasSpeech(page);
  await openMoreGameModes(page);

  const tools = page.locator('#illustrated-home-tools');
  await expect(tools).toBeVisible();
  await tools.getByRole('button').filter({ hasText: 'Experimentos geniales' }).click();
  await expect(page.getByRole('heading', { name: 'Experimentos geniales', exact: true })).toBeVisible();
}

async function withCapturePage(browser, capture, callback, profileSeed = {}) {
  const context = await browser.newContext({
    viewport: { width: capture.width, height: capture.height },
    hasTouch: capture.hasTouch,
    isMobile: capture.hasTouch,
  });
  const page = await context.newPage();
  try {
    await openExperiments(page, profileSeed);
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
      entrances: [...document.querySelectorAll('.lab-workshop-portal, .lab-workshop-map-table, .lab-workshop-tool')].map((button) => {
        const box = button.getBoundingClientRect();
        const node = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2);
        return {
          name: button.textContent.trim().replace(/\\s+/g, ' ').slice(0, 40),
          left: box.left, top: box.top, right: box.right, bottom: box.bottom,
          width: box.width, height: box.height,
          centerClickable: Boolean(node && (node === button || button.contains(node))),
        };
      }),
      pawnSlug: rect('.lab-workshop-portal--pawnslug-godot'),
      trailblazer: rect('.lab-workshop-portal--trailblazer'),
      tacticalDeck: rect('.lab-workshop-wing--ops'),
      genericCardsInsideArcade: document.querySelectorAll('.lab-workshop-wing--hangar .experiments-card').length,
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
    for (const capture of LANDING_CAPTURES) {
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
          expect(health.entrances, `${capture.label}: eight actionable experiments`).toHaveLength(8);
          for (const entry of health.entrances) {
            expect(entry.left, `${capture.label}: ${entry.name} left`).toBeGreaterThanOrEqual(-1);
            expect(entry.right, `${capture.label}: ${entry.name} right`).toBeLessThanOrEqual(capture.width + 1);
            expect(entry.top, `${capture.label}: ${entry.name} top`).toBeGreaterThanOrEqual(-1);
            expect(entry.bottom, `${capture.label}: ${entry.name} first-screen bottom`).toBeLessThanOrEqual(capture.height + 1);
            expect(entry.width, `${capture.label}: ${entry.name} width for touch`).toBeGreaterThanOrEqual(44);
            expect(entry.height, `${capture.label}: ${entry.name} height for touch`).toBeGreaterThanOrEqual(44);
            expect(entry.centerClickable, `${capture.label}: ${entry.name} hit test`).toBe(true);
          }
          if (capture.height > capture.width) {
            expect(health.trailblazer.top, `${capture.label}: Trailblazer stacked below Pawn Slug`).toBeGreaterThan(health.pawnSlug.top);
          } else {
            for (const [name, rect] of [['Pawn Slug', health.pawnSlug], ['Trailblazer', health.trailblazer]]) {
              expect(rect?.top, `${capture.label}: ${name} should start onscreen`).toBeGreaterThanOrEqual(-1);
              expect(rect?.bottom, `${capture.label}: ${name} should fit first screen`).toBeLessThanOrEqual(capture.height + 1);
            }
          }
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
  test('Football · standalone portal and legacy career export', async ({ browser }) => {
    test.setTimeout(120_000);
    await mkdir(ARTIFACT_DIR, { recursive: true });
    for (const capture of CAPTURES) {
      await withCapturePage(browser, capture, async (page) => {
        const portal = page.locator('.lab-workshop-portal--football');
        await portal.scrollIntoViewIfNeeded();
        await expect(portal).toContainText('Football of Matthias');
        await expect(page.locator('.chess-football-entry, .chess-football-godot-host')).toHaveCount(0);
        // The legacy export is secondary and must not cover the Lab title,
        // back navigation or any experiment hotspot on desktop/Android.
        const exportLayout = await page.evaluate(() => {
          const button = document.querySelector('.lab-football-export');
          const rect = button?.getBoundingClientRect();
          const title = document.querySelector('.lab-workshop-masthead h2')?.getBoundingClientRect();
          const back = document.querySelector('.lab-screen > .back-link')?.getBoundingClientRect();
          const portals = [...document.querySelectorAll('.lab-workshop-portal')].map((node) => node.getBoundingClientRect());
          const overlaps = (a, b) => Boolean(a && b && a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top);
          return {
            present: Boolean(rect),
            insideViewport: Boolean(rect && rect.left >= 0 && rect.right <= innerWidth && rect.top >= 0 && rect.bottom <= innerHeight),
            collision: Boolean(rect && [title, back, ...portals].some((other) => overlaps(rect, other))),
          };
        });
        expect(exportLayout.present, `${capture.label}: legacy export visible`).toBe(true);
        expect(exportLayout.insideViewport, `${capture.label}: legacy export within viewport`).toBe(true);
        expect(exportLayout.collision, `${capture.label}: legacy export must not cover Lab navigation/content`).toBe(false);
        await captureFrozenFrame(page, { path: `${ARTIFACT_DIR}/football-portal-${capture.label}.png`, fullPage: true });
        const popupPromise = page.waitForEvent('popup');
        await portal.click();
        const popup = await popupPromise;
        await popup.waitForURL('https://staging.football.shadowops.dpdns.org/**');
        expect(await popup.evaluate(() => window.opener === null)).toBe(true);
        await popup.close();
        const downloadPromise = page.waitForEvent('download');
        await page.getByRole('button', {name:'Exportar carrera antigua de Football',exact:true}).click();
        const download = await downloadPromise;
        expect(download.suggestedFilename()).toBe('football-carrera.json');
      }, { 'chess-study-football-manager-career-v1': JSON.stringify({version:4,clubId:'fc-matthias',initialSeed:2026,seed:2026,completedSeasons:[],rounds:[],legacyRounds:0,nextTactic:'balanced',nextTraining:'standard',nextLineup:['fc-matthias-por-1','fc-matthias-def-1','fc-matthias-med-1','fc-matthias-med-2','fc-matthias-del-1']}) });
    }
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

if (scopeEnabled('landing')) {
  test('Laboratorio libre · tablero protagonista en desktop y móvil', async ({ browser }) => {
    test.setTimeout(240_000);
    await mkdir(ARTIFACT_DIR, { recursive: true });
    for (const capture of LAB_CAPTURES) {
      await withCapturePage(browser, capture, async (page) => {
        await page.locator('.lab-workshop-tool:not(.lab-workshop-tool--arena)').click();
        const root = page.locator('.lab-screen--position');
        await expect(root.getByRole('heading', { name: 'Prepara una posición y juega' })).toBeVisible();
        await expect(root.locator('.lab-board-editor [data-board3d-war-room="true"]'))
          .toBeVisible({ timeout: 45_000 });
        const geom = await root.evaluate((node) => {
          const rect = (selector) => {
            const bounds = node.querySelector(selector).getBoundingClientRect();
            return { left: bounds.left, right: bounds.right, top: bounds.top, bottom: bounds.bottom };
          };
          return {
            overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
            board: rect('.lab-position-stage'),
            tools: rect('.lab-position-controls'),
          };
        });
        expect(geom.overflow, `${capture.label}: no horizontal overflow`).toBe(false);
        expect(geom.board.top, `${capture.label}: board starts in first viewport`)
          .toBeLessThan(capture.height);
        if (capture.width > 900) {
          expect(geom.tools.left, `${capture.label}: tools beside board`)
            .toBeGreaterThanOrEqual(geom.board.right - 2);
        } else {
          expect(geom.tools.top, `${capture.label}: tools follow board on phone`)
            .toBeGreaterThanOrEqual(geom.board.top);
        }
        await captureFrozenFrame(page, {
          path: `${ARTIFACT_DIR}/lab-position-editor-${capture.label}.png`,
          fullPage: true,
        });
        // Also capture the actual first viewport: full-page PNGs alone hide
        // fixed audio overlap and above-the-fold hierarchy.
        await captureFrozenFrame(page, {
          path: `${ARTIFACT_DIR}/lab-position-editor-viewport-${capture.label}.png`,
          fullPage: false,
        });
        if (capture.hasTouch) {
          // A static full-page image cannot prove the brush-to-board return.
          // Capture the actual viewport after selecting a piece below the board.
          const whiteKing = root.getByRole('button', { name: 'Colocar ♔ blanco' });
          await whiteKing.click();
          await expect(whiteKing).toHaveAttribute('aria-pressed', 'true');
          await expect(root.locator('.lab-position-stage-head [aria-live="polite"]'))
            .toContainText('Pieza ♔ seleccionada');
          const boardTop = async () => (await root.locator('.lab-position-stage').boundingBox())?.y ?? -Infinity;
          await expect.poll(boardTop).toBeGreaterThanOrEqual(240);
          await expect.poll(boardTop).toBeLessThan(410);
          // Returning to the editor intro must keep the heading clear of fixed audio.
          // Verify a point in the first heading line remains visible and unobstructed.
          const headingHit = await root.getByRole('heading', { name: 'Prepara una posición y juega' }).evaluate((heading) => {
            const bounds = heading.getBoundingClientRect();
            const x = bounds.left + Math.min(16, bounds.width / 4);
            const y = bounds.top + Math.min(20, bounds.height / 2);
            const hit = document.elementFromPoint(x, y);
            return { inViewport: y >= 0 && y < window.innerHeight, unobscured: hit === heading || heading.contains(hit) };
          });
          expect(headingHit.inViewport, `${capture.label}: editor heading remains visible`).toBe(true);
          expect(headingHit.unobscured, `${capture.label}: audio does not cover editor heading`).toBe(true);
          // The fixed audio player must not steal the first touch on the mode tab.
          // Check the left side of the tab, not only its center (which stayed free).
          const modeTabHit = await root.getByRole('tab', { name: 'Posición normal' }).evaluate((tab) => {
            const bounds = tab.getBoundingClientRect();
            const x = bounds.left + Math.min(16, bounds.width / 4);
            const y = bounds.top + bounds.height / 2;
            const topmost = document.elementFromPoint(x, y);
            return {
              inViewport: bounds.top >= 0 && bounds.bottom <= window.innerHeight,
              tappable: Boolean(topmost && (topmost === tab || tab.contains(topmost))),
            };
          });
          expect(modeTabHit.inViewport, `${capture.label}: mode tab visible after brush return`).toBe(true);
          expect(modeTabHit.tappable, `${capture.label}: mode tab not obscured by audio`).toBe(true);
          await captureFrozenFrame(page, {
            path: `${ARTIFACT_DIR}/lab-position-selected-${capture.label}.png`,
            fullPage: false,
          });
        }
      });
    }
  });
}

// Opt-in comparison against the exact PR base. The workflow builds that SHA
// into frontend/dist before invoking only this test. Do not apply the new
// Lab geometry assertions to the old, accepted main layout.
if (process.env.LAB_MAIN_BASELINE_SHA) {
  test('Laboratorio libre · baseline main exacto desktop y móvil', async ({ browser }) => {
    test.setTimeout(300_000);
    const baseSha = process.env.LAB_MAIN_BASELINE_SHA;
    expect(baseSha).toMatch(/^[a-f0-9]{40}$/);
    const dir = `${ARTIFACT_DIR}/lab-main-baseline-${baseSha.slice(0, 12)}`;
    await mkdir(dir, { recursive: true });
    for (const capture of LAB_CAPTURES) {
      await withCapturePage(browser, capture, async (page) => {
        await page.locator('.lab-workshop-tool:not(.lab-workshop-tool--arena)').click();
        await expect(page.getByRole('heading', { name: 'Prepara una posición y juega', exact: true })).toBeVisible();
        await expect(page.locator('.lab-board-editor [data-board3d-war-room="true"]'))
          .toBeVisible({ timeout: 45_000 });
        await captureFrozenFrame(page, {
          path: `${dir}/lab-position-editor-${capture.label}.png`,
          fullPage: true,
        });
        await captureFrozenFrame(page, {
          path: `${dir}/lab-position-editor-viewport-${capture.label}.png`,
          fullPage: false,
        });
        if (capture.hasTouch) {
          // Main's original toolbar has no PR-only palette labels or auto-return.
          await page.locator('.lab-brush').filter({ hasText: '♔' }).click();
          await captureFrozenFrame(page, {
            path: `${dir}/lab-position-selected-${capture.label}.png`,
            fullPage: false,
          });
        }
      });
    }
    await writeFile(`${dir}/provenance.json`, `${JSON.stringify({
      source: 'pull_request.base.sha', baseSha,
      viewports: LAB_CAPTURES.map(({ label, width, height }) => ({ label, width, height })),
      states: ['initial editor', 'white king selected on mobile'],
    }, null, 2)}\n`, 'utf8');
  });
}

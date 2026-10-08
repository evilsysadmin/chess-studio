import { expect, test } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { confirmChroniclesCharacterSetup, login, mockApi, openMoreGameModes } from './helpers.js';

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

async function openTactics(page, {
  chroniclesRunFailureStatus = 0,
  chroniclesCurrentMapId = 'crypt-eight-squares',
  expectReady = true,
  authenticated = false,
} = {}) {
  if (!authenticated) {
    await mockApi(page, {
      chroniclesRunFailureStatus,
      chroniclesCurrentMapId,
      profileSeed: {
        'matthias.onboarded': '2',
        'chess-study-home-guide-dismissed-v1': '1',
      },
    });
    await login(page);
  }
  await dismissGuide(page);
  const speech = page.getByRole('region', { name: 'Mensaje de Matthias', exact: true });
  if (await speech.isVisible().catch(() => false)) {
    const close = speech.getByRole('button', { name: 'Cerrar comentario de Matthias', exact: true });
    if (await close.isVisible().catch(() => false)) await close.click({ force: true });
  }
  try {
    await openMoreGameModes(page);
  } catch (error) {
    // Visual proof cares about the rendered Tactics surface, not whether Home's
    // animated dungeon trigger satisfies Playwright's transient "stable" check.
    // Keep the canonical helper first; only bypass actionability after its own
    // timeout when the real trigger is already visible and enabled.
    const trigger = page.locator('.illustrated-home__utilities')
      .getByRole('button', { name: /Más modos y herramientas/ });
    if (!(await trigger.isVisible().catch(() => false)) || await trigger.isDisabled().catch(() => true)) {
      throw error;
    }
    await trigger.evaluate((button) => button.click());
  }
  const tools = page.locator('#illustrated-home-tools');
  await expect(tools).toBeVisible();
  await tools.getByRole('button').filter({ hasText: 'Experimentos geniales' }).click();
  await expect(page.getByRole('heading', { name: 'Experimentos geniales', exact: true })).toBeVisible();
  await page.getByRole('button').filter({ hasText: 'Abrir la mesa táctica' }).click();
  await confirmChroniclesCharacterSetup(page);
  if (expectReady) {
    await expect(page.getByRole('heading', { name: 'Chronicles of Matthias Tactics', exact: true })).toBeVisible();
  }
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
      // Navigation through Home is not part of this producer's visual contract.
      // Enter Tactics from a stable canonical desktop layout, preserving touch
      // capability from browser creation so the renderer still selects its
      // coarse-pointer/mobile quality path. Resize only after Tactics is live.
      viewport: {
        width: capture.hasTouch ? 1180 : capture.width,
        height: capture.hasTouch ? 900 : capture.height,
      },
      hasTouch: capture.hasTouch,
      reducedMotion: 'no-preference',
    });
    const page = await context.newPage();
    try {
      await openTactics(page);
      if (capture.hasTouch) {
        // The production entry correctly requests fullscreen from the user gesture.
        // The visual harness must leave fullscreen before resizing its synthetic
        // desktop browser window to a mobile viewport.
        await page.evaluate(async () => {
          if (document.fullscreenElement && document.exitFullscreen) {
            await document.exitFullscreen();
          }
        });
        await expect.poll(() => page.evaluate(() => Boolean(document.fullscreenElement))).toBe(false);
        await page.setViewportSize({ width: capture.width, height: capture.height });
        await page.waitForTimeout(180);
      }
      const mode = page.locator('[data-chronicles-tactics="true"]');
      const viewport = mode.locator('.chronicles-tactics__viewport');
      const canvas = mode.locator('[data-chronicles-tactics-renderer="three"] canvas');
      await expect(canvas).toHaveCount(1, { timeout: 30_000 });
      await expect(canvas).toBeVisible();
      await expect(viewport).toBeVisible();
      await expect(mode).toHaveAttribute('data-camera', 'isometric-behind-party');
      await expect(mode).toHaveAttribute('data-combat', 'turn-based');
      await expect(page.getByText('ESC o clic derecho · volver / cerrar', { exact: true })).toBeHidden();
      await page.waitForTimeout(500);

      const health = await captureTacticsHealth(page);
      expect(health.horizontalOverflow, `${capture.label}: Tactics overflow`).toBe(false);
      expect(health.canvasCount, `${capture.label}: Tactics canvas`).toBe(1);
      expect(health.partyMemberCount, `${capture.label}: canonical four-member party`).toBe(4);
      expect(health.camera).toBe('isometric-behind-party');
      expect(health.combat).toBe('turn-based');
      expect(health.viewport?.width || 0, `${capture.label}: Tactics viewport width`).toBeGreaterThan(0);
      expect(health.viewport?.height || 0, `${capture.label}: Tactics viewport height`).toBeGreaterThan(0);
      expect(health.canvas?.width || 0, `${capture.label}: Tactics canvas width`).toBeGreaterThan(0);
      expect(health.canvas?.height || 0, `${capture.label}: Tactics canvas height`).toBeGreaterThan(0);
      expectCanvasFillsViewport(health, capture.label);
      if (capture.width >= 1180) expectDesktopCanonicalComposition(health, capture.label);

      const partyHud = mode.locator('.chronicles-party-hud');
      const partyPortraits = partyHud.locator('.chronicles-party-hud__portrait-frame img');
      await expect(partyPortraits).toHaveCount(4);
      const authoredPortraits = await partyPortraits.evaluateAll((images) => images.every((image) => (
        image.complete
        && image.naturalWidth >= 128
        && image.naturalHeight >= 128
        && !image.src.startsWith('data:')
      )));
      expect(authoredPortraits, `${capture.label}: authored Tactics portraits decoded`).toBe(true);
      await captureElement(
        page,
        partyHud,
        `${ARTIFACT_DIR}/chronicles-tactics-party-portraits-${capture.label}.png`,
      );

      const pausedCell = await mode.evaluate((node) => ({
        x: node.getAttribute('data-party-x'),
        y: node.getAttribute('data-party-y'),
        actor: node.getAttribute('data-initiative-actor'),
      }));
      await partyHud.getByRole('button', { name: 'Abrir ficha de Matthias', exact: true }).click();
      const sheet = page.getByRole('dialog', { name: 'Matthias', exact: true });
      await expect(sheet).toBeVisible();
      const sheetOcclusion = await page.evaluate(() => {
        const backdrop = document.querySelector('.chronicles-character-sheet__backdrop');
        const portrait = document.querySelector('.chronicles-character-sheet__portrait');
        const backdropBox = backdrop?.getBoundingClientRect();
        const portraitBox = portrait?.getBoundingClientRect();
        if (!backdropBox || !portraitBox) return null;
        const sampleX = portraitBox.left + Math.min(10, portraitBox.width / 4);
        const sampleY = portraitBox.top + Math.min(10, portraitBox.height / 4);
        const topNode = document.elementFromPoint(sampleX, sampleY);
        return {
          backdrop: {
            left: backdropBox.left,
            top: backdropBox.top,
            right: backdropBox.right,
            bottom: backdropBox.bottom,
          },
          viewport: { width: window.innerWidth, height: window.innerHeight },
          portraitOwnedBySheet: Boolean(topNode?.closest?.('.chronicles-character-sheet')),
        };
      });
      expect(sheetOcclusion, `${capture.label}: character sheet overlay health`).not.toBeNull();
      expect(Math.abs(sheetOcclusion.backdrop.left), `${capture.label}: sheet reaches viewport left`).toBeLessThanOrEqual(1);
      expect(Math.abs(sheetOcclusion.backdrop.top), `${capture.label}: sheet reaches viewport top`).toBeLessThanOrEqual(1);
      expect(sheetOcclusion.backdrop.right, `${capture.label}: sheet reaches viewport right`).toBeGreaterThanOrEqual(sheetOcclusion.viewport.width - 1);
      expect(sheetOcclusion.backdrop.bottom, `${capture.label}: sheet reaches viewport bottom`).toBeGreaterThanOrEqual(sheetOcclusion.viewport.height - 1);
      expect(sheetOcclusion.portraitOwnedBySheet, `${capture.label}: no global chrome may cover the character portrait`).toBe(true);
      await page.keyboard.down('ArrowUp');
      await page.waitForTimeout(180);
      await page.keyboard.up('ArrowUp');
      await page.waitForTimeout(180);
      await expect(mode).toHaveAttribute('data-party-x', pausedCell.x);
      await expect(mode).toHaveAttribute('data-party-y', pausedCell.y);
      await expect(mode).toHaveAttribute('data-initiative-actor', pausedCell.actor);
      const sheetPortrait = sheet.locator('.chronicles-character-sheet__portrait img');
      await expect(sheetPortrait).toBeVisible();
      await captureElement(
        page,
        sheet,
        `${ARTIFACT_DIR}/chronicles-tactics-character-sheet-${capture.label}.png`,
      );
      await sheet.getByRole('button', { name: 'Cerrar ficha', exact: true }).click();

      await captureElement(page, viewport, `${ARTIFACT_DIR}/chronicles-tactics-${capture.label}.png`);

      await page.keyboard.press('Escape');
      const openedMenu = mode.locator('.chronicles-tactics__game-menu[open]');
      await expect(openedMenu).toBeVisible();
      await expect(openedMenu.getByRole('button', { name: 'Continuar', exact: true })).toBeVisible();
      await expect(openedMenu.getByRole('button', { name: 'Salir', exact: true })).toBeVisible();
      await page.screenshot({
        path: `${ARTIFACT_DIR}/chronicles-tactics-menu-open-${capture.label}.png`,
        animations: 'disabled',
        fullPage: capture.hasTouch,
        timeout: 30_000,
      });
      await page.keyboard.press('Escape');
      await expect(mode.locator('.chronicles-tactics__game-menu[open]')).toHaveCount(0);

      if (capture.hasTouch) {
        // On narrow layouts the mission, action pad and party HUD flow below the
        // battlefield. Keep the battlefield crop for renderer inspection, and
        // add a full-page proof so human review can judge the complete mobile UI.
        await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
        await page.waitForTimeout(120);
        await page.screenshot({
          path: `${ARTIFACT_DIR}/chronicles-tactics-full-${capture.label}.png`,
          fullPage: true,
          animations: 'disabled',
          timeout: 30_000,
        });
      }

      // Required visual gameplay proof: move the party through the real React
      // action into a safe canonical cell, assert the resulting runtime message,
      // then capture the post-movement WebGL state for human inspection.
      const narrator = mode.locator('.chronicles-tactics__narrator p');
      const rendererHost = mode.locator('[data-chronicles-tactics-renderer="three"]');
      const moveNorth = mode.getByRole('button', { name: 'Mover al norte', exact: true });
      await expect(moveNorth).toBeEnabled();
      await page.keyboard.down('ArrowUp');
      await expect(rendererHost).toHaveAttribute('data-chronicles-party-motion', 'walking');
      await captureElement(
        page,
        viewport,
        `${ARTIFACT_DIR}/chronicles-tactics-walking-${capture.label}.png`,
      );
      await page.keyboard.up('ArrowUp');
      await expect(narrator).toContainText(/La compañía avanza hacia norte/i);
      const releasedCell = await mode.evaluate((node) => ({
        x: node.getAttribute('data-party-x'),
        y: node.getAttribute('data-party-y'),
      }));
      await page.waitForTimeout(260);
      await expect(mode).toHaveAttribute('data-party-x', releasedCell.x);
      await expect(mode).toHaveAttribute('data-party-y', releasedCell.y);
      const movementMessage = ((await narrator.textContent()) || '').trim();
      await captureElement(page, viewport, `${ARTIFACT_DIR}/chronicles-tactics-moved-${capture.label}.png`);

      await writeFile(
        `${ARTIFACT_DIR}/chronicles-tactics-visual-health-${capture.label}.json`,
        `${JSON.stringify({
          schema: 3,
          scope: 'chronicles-tactics',
          capture: { label: capture.label, ...health },
          portraits: {
            source: 'authored',
            count: 4,
            characterSheet: true,
          },
          gameplay: {
            movedNorth: true,
            message: movementMessage,
            continuousWalkCaptured: true,
          },
        }, null, 2)}\n`,
        'utf8',
      );
    } finally {
      await context.close();
    }
  });

  test(`Chronicles Tactics · combat grid visual proof · ${capture.label}`, async ({ browser }) => {
    test.setTimeout(90_000);
    await mkdir(ARTIFACT_DIR, { recursive: true });

    const context = await browser.newContext({
      viewport: {
        width: capture.hasTouch ? 1180 : capture.width,
        height: capture.hasTouch ? 900 : capture.height,
      },
      hasTouch: capture.hasTouch,
      reducedMotion: 'no-preference',
    });
    const page = await context.newPage();
    try {
      await openTactics(page);
      if (capture.hasTouch) {
        // Desktop fullscreen needs to be released before reusing this context at mobile size.
        await page.evaluate(async () => {
          if (document.fullscreenElement) await document.exitFullscreen();
        });
        await expect.poll(() => page.evaluate(() => document.fullscreenElement === null)).toBe(true);
        await page.setViewportSize({ width: capture.width, height: capture.height });
        await page.waitForTimeout(180);
      }

      const mode = page.locator('[data-chronicles-tactics="true"]');
      const viewport = mode.locator('.chronicles-tactics__viewport');
      await expect(mode.locator('[data-chronicles-tactics-renderer="three"] canvas')).toHaveCount(1, { timeout: 30_000 });
      await expect(mode).toHaveAttribute('data-engagement', 'exploration');
      await expect(mode).toHaveAttribute('data-party-x', '1');
      await expect(mode).toHaveAttribute('data-party-y', '5');

      const moveNorth = mode.getByRole('button', { name: 'Mover al norte', exact: true });
      await page.waitForTimeout(140);
      await expect(moveNorth).toBeEnabled();
      await moveNorth.evaluate((button) => button.click());
      await expect(mode).toHaveAttribute('data-engagement', 'exploration');

      await page.waitForTimeout(140);
      await expect(moveNorth).toBeEnabled();
      await moveNorth.evaluate((button) => button.click());
      await expect(mode).toHaveAttribute('data-engagement', 'exploration');

      await page.waitForTimeout(140);
      const moveEast = mode.getByRole('button', { name: 'Mover al este', exact: true });
      await expect(moveEast).toBeEnabled();
      await moveEast.evaluate((button) => button.click());
      await expect(mode).toHaveAttribute('data-engagement', 'combat');
      await expect(mode).not.toHaveAttribute('data-initiative-actor', '');
      await page.waitForTimeout(180);

      await captureElement(
        page,
        viewport,
        `${ARTIFACT_DIR}/chronicles-tactics-combat-grid-${capture.label}.png`,
      );
    } finally {
      await context.close();
    }
  });
}


const AUTHORED_ROOM_VISUAL_CAPTURES = Object.freeze([
  Object.freeze({ mapId: 'gallery-of-forks', slug: 'gallery-of-forks' }),
  Object.freeze({ mapId: 'menagerie-of-ash', slug: 'menagerie-of-ash' }),
  Object.freeze({ mapId: 'echo-cistern', slug: 'echo-cistern' }),
  Object.freeze({ mapId: 'ash-vault', slug: 'ash-vault' }),
  Object.freeze({ mapId: 'chain-basilica', slug: 'chain-basilica' }),
]);

for (const room of AUTHORED_ROOM_VISUAL_CAPTURES) {
  test(`Chronicles Tactics · authored room visual proof · ${room.mapId}`, async ({ browser }) => {
    test.setTimeout(150_000);
    await mkdir(ARTIFACT_DIR, { recursive: true });

    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await context.newPage();
    try {
      await openTactics(page, { chroniclesCurrentMapId: room.mapId });
      const mode = page.locator('[data-chronicles-tactics="true"]');
      const viewport = mode.locator('.chronicles-tactics__viewport');
      const canvas = mode.locator('[data-chronicles-tactics-renderer="three"] canvas');

      await expect(canvas).toHaveCount(1, { timeout: 30_000 });
      await expect(canvas).toBeVisible();
      await expect(viewport).toBeVisible();
      await page.waitForTimeout(700);

      const health = await captureTacticsHealth(page);
      expect(health.horizontalOverflow, `${room.mapId}: Tactics overflow`).toBe(false);
      expect(health.canvasCount, `${room.mapId}: Tactics canvas`).toBe(1);
      expect(health.partyMemberCount, `${room.mapId}: canonical four-member party`).toBe(4);
      expectCanvasFillsViewport(health, room.mapId);
      expectDesktopCanonicalComposition(health, room.mapId);
      const rendererHost = mode.locator('[data-chronicles-tactics-renderer="three"]');
      if (room.mapId === 'gallery-of-forks') {
        const [expectedEnemyIds, renderedEnemyIds] = JSON.parse(
          (await rendererHost.getAttribute('data-chronicles-enemy-render-proof')) || '[[],[]]',
        );
        expect(expectedEnemyIds.sort(), 'Gallery gameplay exposes both authored threats').toEqual(
          ['fork-stalker', 'gate-jailer'].sort(),
        );
        expect(renderedEnemyIds.sort(), 'Every active Gallery enemy owns a visible placed Three.js model').toEqual(expectedEnemyIds.sort());
        health.enemyRender = { expectedEnemyIds, renderedEnemyIds, parity: true };
      }
      if (room.mapId === 'menagerie-of-ash') {
        const [expectedEnemyIds, renderedEnemyIds] = JSON.parse(
          (await rendererHost.getAttribute('data-chronicles-enemy-render-proof')) || '[[],[]]',
        );
        expect(expectedEnemyIds.sort(), 'Menagerie gameplay must expose all four active enemies').toEqual(
          ['ash-goblin', 'bone-hound', 'crypt-spider', 'ember-wisp'].sort(),
        );
        expect(renderedEnemyIds.sort(), 'Every active Menagerie enemy must own a visible placed Three.js model').toEqual(expectedEnemyIds.sort());
        health.enemyRender = { expectedEnemyIds, renderedEnemyIds, parity: true };
      }

      await captureElement(
        page,
        viewport,
        `${ARTIFACT_DIR}/chronicles-tactics-${room.slug}-desktop-1440x900.png`,
      );

      if (room.mapId === 'gallery-of-forks') {
        const moveEast = mode.getByRole('button', { name: 'Mover al este', exact: true });
        await expect(moveEast).toBeEnabled();
        await moveEast.evaluate((button) => button.click());
        await page.waitForTimeout(320);
        await captureElement(
          page,
          viewport,
          `${ARTIFACT_DIR}/chronicles-tactics-gallery-of-forks-fork-stalker-desktop-1440x900.png`,
        );
      }

      await writeFile(
        `${ARTIFACT_DIR}/chronicles-tactics-${room.slug}-visual-health-desktop-1440x900.json`,
        `${JSON.stringify({
          schema: 1,
          scope: 'chronicles-tactics-authored-room',
          mapId: room.mapId,
          capture: { label: 'desktop-1440x900', ...health },
        }, null, 2)}\n`,
        'utf8',
      );

      if (room.mapId === 'echo-cistern') {
        // Desktop Chronicles owns native fullscreen. Exit it before resizing the
        // same Chromium window for the separate mobile-layout proof.
        await page.evaluate(async () => {
          if (document.fullscreenElement) await document.exitFullscreen();
        });
        await expect.poll(() => page.evaluate(() => document.fullscreenElement === null)).toBe(true);
        await page.setViewportSize({ width: 390, height: 844 });
        await page.waitForTimeout(420);
        const mobileHealth = await captureTacticsHealth(page);
        expect(mobileHealth.horizontalOverflow, 'echo-cistern mobile overflow').toBe(false);
        expect(mobileHealth.canvasCount, 'echo-cistern mobile canvas').toBe(1);
        expect(mobileHealth.partyMemberCount, 'echo-cistern mobile canonical party').toBe(4);
        expectCanvasFillsViewport(mobileHealth, 'echo-cistern-mobile');
        await captureElement(
          page,
          viewport,
          `${ARTIFACT_DIR}/chronicles-tactics-echo-cistern-mobile-390x844.png`,
        );
        await writeFile(
          `${ARTIFACT_DIR}/chronicles-tactics-echo-cistern-visual-health-mobile-390x844.json`,
          `${JSON.stringify({
            schema: 1,
            scope: 'chronicles-tactics-authored-room',
            mapId: room.mapId,
            capture: { label: 'mobile-390x844', ...mobileHealth },
          }, null, 2)}\n`,
          'utf8',
        );
      }
    } finally {
      await context.close();
    }
  });
}


test('Chronicles Tactics · large-map scenery regression · Hollow Bell Tower', async ({ browser }) => {
  test.setTimeout(150_000);
  await mkdir(ARTIFACT_DIR, { recursive: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  try {
    await openTactics(page, { chroniclesCurrentMapId: 'hollow-bell-tower' });
    const mode = page.locator('[data-chronicles-tactics="true"]');
    const viewport = mode.locator('.chronicles-tactics__viewport');
    const canvas = mode.locator('[data-chronicles-tactics-renderer="three"] canvas');
    await expect(canvas).toBeVisible({ timeout: 30_000 });
    await expect(mode).toContainText('Torre de las Campanas Huecas');
    await page.waitForTimeout(700);
    await captureElement(
      page,
      viewport,
      `${ARTIFACT_DIR}/chronicles-tactics-hollow-bell-tower-desktop-1440x900.png`,
    );
  } finally {
    await context.close();
  }
});


for (const capture of CAPTURES) {
  test(`Chronicles Tactics · bootstrap failure visual proof · ${capture.label}`, async ({ browser }) => {
    test.setTimeout(150_000);
    await mkdir(ARTIFACT_DIR, { recursive: true });

    const context = await browser.newContext({
      viewport: {
        width: capture.hasTouch ? 1180 : capture.width,
        height: capture.hasTouch ? 900 : capture.height,
      },
      hasTouch: capture.hasTouch,
    });
    const page = await context.newPage();
    try {
      await openTactics(page, {
        chroniclesRunFailureStatus: 503,
        expectReady: false,
      });
      if (capture.hasTouch) {
        await page.setViewportSize({ width: capture.width, height: capture.height });
        await page.waitForTimeout(120);
      }

      const error = page.locator('.chronicles-tactics__bootstrap-error');
      await expect(error).toBeVisible();
      await expect(error.getByText('Código CHR-BOOT-002', { exact: true })).toBeVisible();
      await expect(page.locator('[data-chronicles-tactics-renderer="three"] canvas')).toHaveCount(0);

      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(overflow, `${capture.label}: bootstrap error overflow`).toBeLessThanOrEqual(1);

      await captureElement(
        page,
        error,
        `${ARTIFACT_DIR}/chronicles-tactics-bootstrap-error-${capture.label}.png`,
      );

      await writeFile(
        `${ARTIFACT_DIR}/chronicles-tactics-bootstrap-error-health-${capture.label}.json`,
        `${JSON.stringify({
          schema: 1,
          scope: 'chronicles-tactics-bootstrap-error',
          capture,
          errorCode: 'CHR-BOOT-002',
          canvasCount: 0,
          horizontalOverflow: overflow > 1,
        }, null, 2)}\n`,
        'utf8',
      );
    } finally {
      await context.close();
    }
  });
}

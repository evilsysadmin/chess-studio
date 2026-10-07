import { expect, test } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { confirmChroniclesCharacterSetup, login, mockApi, openMoreGameModes } from './helpers.js';

const ARTIFACT_DIR = '../.artifacts/app-visual';
const CAPTURES = [
  { label: 'desktop-1440x900', width: 1440, height: 900, hasTouch: false },
  { label: 'android-390x844', width: 390, height: 844, hasTouch: true },
  { label: 'android-landscape-844x390', width: 844, height: 390, hasTouch: true },
];

async function openVisualMoreModes(page) {
  const trigger = page.getByRole('button', { name: /Más modos y herramientas/ });
  const portraitMore = page.locator('.illustrated-home__play-more');
  await expect.poll(async () => {
    if (await trigger.isVisible().catch(() => false)) return 'illustrated';
    if (await portraitMore.isVisible().catch(() => false)) return 'portrait';
    return 'pending';
  }, { timeout: 20_000, message: 'Home should expose the dungeon trigger or the portrait More route' }).not.toBe('pending');

  // The portrait vestibule (#4476) hides the dungeon trigger behind «Más»;
  // the shared helper owns that route.
  if (!(await trigger.isVisible().catch(() => false))) {
    await openMoreGameModes(page);
    return;
  }

  // This producer validates Chronicles, not Home animation actionability.
  // Invoke the real button handler directly once the canonical trigger is visible.
  await trigger.evaluate((button) => button.click());
}

async function openChronicles(page, captureLabel, {
  runStatus = 'active',
  chroniclesCurrentMapId = 'crypt-eight-squares',
  chroniclesWorldFlags = null,
} = {}) {
  await mockApi(page, {
    profileSeed: {
      'matthias.onboarded': '2',
      'chess-study-home-guide-dismissed-v1': '1',
    },
    chroniclesRunStatus: runStatus,
    chroniclesCurrentMapId,
    chroniclesWorldFlags,
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
  if (await pvpLobby.isVisible().catch(() => false)) {
    await pvpLobby.getByRole('button', { name: /Cerrar ventana/ }).click({ force: true });
    await expect(pvpLobby).toBeHidden();
  }
  await tools.getByRole('button').filter({ hasText: 'Experimentos geniales' }).evaluate((button) => button.click());
  await expect(page.getByRole('heading', { name: 'Experimentos geniales', exact: true })).toBeVisible();
  const chroniclesEntry = page.locator('.lab-workshop-portal--chronicles');
  await expect(chroniclesEntry).toBeVisible();
  await chroniclesEntry.click();
  const setup = page.locator('[data-chronicles-character-setup]');
  try {
    await expect(setup).toBeVisible({ timeout: 8_000 });
  } catch (error) {
    // Touch/WebKit-style click dispatch can occasionally land while the
    // experiments sheet is still settling. Retry the actual navigation once
    // only if the source button is still visible; never mask a real Chronicle
    // bootstrap/render failure after the route has changed.
    if (!(await chroniclesEntry.isVisible().catch(() => false))) throw error;
    await chroniclesEntry.click({ force: true });
    await expect(setup).toBeVisible({ timeout: 20_000 });
  }
  await captureElement(
    page,
    setup,
    `${ARTIFACT_DIR}/chronicles-character-setup-${captureLabel}.png`,
  );

  await setup.getByRole('button', { name: 'Crear PJs', exact: true }).click();
  const editor = page.locator('[data-chronicles-character-setup="editor"]');
  await expect(editor).toBeVisible();
  const seed = editor.getByRole('textbox', { name: 'Seed de build', exact: true });
  await seed.fill(`VISUAL-${captureLabel}`);
  await editor.getByRole('button', { name: 'Generar con seed', exact: true }).click();
  const mechanics = editor.locator('.chronicles-character-setup__mechanics');
  await expect(mechanics).toBeVisible();
  await expect(mechanics).toContainText(/\+\d/);
  await page.screenshot({
    path: `${ARTIFACT_DIR}/chronicles-character-editor-${captureLabel}.png`,
    animations: 'disabled',
    fullPage: true,
    timeout: 30_000,
  });
  await editor.getByRole('button', { name: '← Volver', exact: true }).click();

  await confirmChroniclesCharacterSetup(page);
  await expect(page.locator('[data-chronicles="true"]')).toBeVisible();
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
      gameRoot: rect('[data-chronicles="true"]'),
      gameMenu: rect('summary[aria-label="Abrir menú de Chronicles"]'),
      automapButton: rect('button[aria-label="Abrir automapa"]'),
      localMinimap: rect('[data-chronicles-minimap="visible"]'),
      stage: rect('.chronicles-stage'),
      gameCanvas: rect('[data-chronicles-renderer="three"] canvas'),
      authoredPortrait: rect('[data-chronicles-party-renderer="authored"]'),
      partyTarget: rect('.chronicles-party-member'),
      forwardControl: rect('[data-chronicles-touch-action="forward"]'),
      attackControl: rect('.chronicles-touch .is-attack'),
      narration: rect('.chronicles-dm-overlay'),
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
    test.setTimeout(360_000);
    await mkdir(ARTIFACT_DIR, { recursive: true });

    const context = await browser.newContext({
      viewport: { width: capture.width, height: capture.height },
      hasTouch: capture.hasTouch,
      isMobile: capture.hasTouch,
    });
    const page = await context.newPage();
    try {
      await openChronicles(page, capture.label);
      const gameRoot = page.locator('[data-chronicles="true"]');
      const chroniclesCanvas = page.locator('[data-chronicles-renderer="three"] canvas');
      const authoredPortrait = page.locator('[data-chronicles-party-renderer="authored"]');
      const stage = page.locator('.chronicles-stage');
      const gameMenu = page.locator('summary[aria-label="Abrir menú de Chronicles"]');
      await expect(gameRoot).toBeVisible();
      if (!capture.hasTouch) {
        expect(
          await page.evaluate(() => document.fullscreenElement),
          `${capture.label}: desktop Chronicles must not enter browser-native fullscreen`,
        ).toBeNull();
      }
      const landscapeTrigger = page.getByRole('button', { name: 'Activar apaisado', exact: true });
      if (capture.hasTouch && capture.width < capture.height) {
        await expect(landscapeTrigger).toBeVisible();
      } else {
        await expect(landscapeTrigger).toHaveCount(0);
      }
      await expect(chroniclesCanvas).toHaveCount(1, { timeout: 20_000 });
      await expect(chroniclesCanvas).toBeVisible();
      await expect(authoredPortrait).toHaveCount(1, { timeout: 20_000 });
      if (capture.hasTouch) await expect(authoredPortrait).toBeHidden();
      else await expect(authoredPortrait).toBeVisible();
      await expect(stage).toBeVisible();
      await expect(gameMenu).toBeVisible();
      await page.waitForTimeout(450);

      if (capture.label === 'desktop-1440x900') {
        const matthias = gameRoot.getByRole('button', { name: 'Seleccionar Matthias', exact: true });
        await matthias.click();
        const sheet = page.getByRole('dialog', { name: 'Matthias', exact: true });
        await expect(sheet).toBeVisible();
        const sheetPortrait = sheet.locator('.chronicles-character-sheet__portrait img');
        const authoredSheetPortrait = await sheetPortrait.evaluate((image) => (
          image.complete
          && image.naturalWidth >= 128
          && image.naturalHeight >= 128
          && !image.src.startsWith('data:')
        ));
        expect(authoredSheetPortrait, 'desktop sheet uses canonical authored portrait').toBe(true);
        await captureElement(
          page,
          sheet,
          `${ARTIFACT_DIR}/chronicles-character-sheet-desktop-1440x900.png`,
        );
        await sheet.getByRole('button', { name: 'Cerrar ficha', exact: true }).click();
      }

      const health = await captureChroniclesHealth(page);
      expect(health.horizontalOverflow, `${capture.label}: Chronicles overflow`).toBe(false);
      expect(health.gameCanvasCount, `${capture.label}: Chronicles dungeon canvas`).toBe(1);
      expect(health.authoredPortraitCount, `${capture.label}: Chronicles authored portrait`).toBe(1);
      expect(health.gameRoot?.left ?? 99, `${capture.label}: fullscreen root left edge`).toBeLessThanOrEqual(1);
      expect(health.gameRoot?.top ?? 99, `${capture.label}: fullscreen root top edge`).toBeLessThanOrEqual(1);
      expect(health.gameRoot?.width || 0, `${capture.label}: fullscreen root width`).toBeGreaterThanOrEqual(capture.width - 2);
      expect(health.gameRoot?.height || 0, `${capture.label}: fullscreen root height`).toBeGreaterThanOrEqual(capture.height - 2);
      expect(health.gameMenu?.width || 0, `${capture.label}: in-game menu visible`).toBeGreaterThan(0);
      expect(health.gameMenu?.height || 0, `${capture.label}: in-game menu height`).toBeGreaterThanOrEqual(30);
      expect(health.automapButton?.width || 0, `${capture.label}: automap button visible`).toBeGreaterThan(0);
      expect(health.automapButton?.height || 0, `${capture.label}: automap button height`).toBeGreaterThanOrEqual(capture.hasTouch ? 44 : 30);
      expect(health.localMinimap?.width || 0, `${capture.label}: local minimap visible`).toBeGreaterThanOrEqual(capture.hasTouch ? 100 : 120);
      expect(health.localMinimap?.height || 0, `${capture.label}: local minimap height`).toBeGreaterThanOrEqual(capture.hasTouch ? 100 : 120);
      expect(health.localMinimap?.top ?? 0, `${capture.label}: local minimap clears top menu`).toBeGreaterThanOrEqual((health.gameMenu?.bottom ?? 0) - 2);
      expect(health.stage?.width || 0, `${capture.label}: Chronicles stage visible`).toBeGreaterThan(0);
      expect(health.gameCanvas?.width || 0, `${capture.label}: Chronicles dungeon canvas visible`).toBeGreaterThan(0);
      expect(health.gameCanvas?.height || 0, `${capture.label}: Chronicles dungeon canvas height`).toBeGreaterThan(0);
      if (capture.hasTouch) {
        expect(health.stage?.height || 0, `${capture.label}: mobile stage owns viewport height`).toBeGreaterThanOrEqual(capture.height - 2);
        expect(health.gameCanvas?.height || 0, `${capture.label}: mobile canvas owns viewport height`).toBeGreaterThanOrEqual(capture.height - 2);
        expect(health.partyTarget?.width || 0, `${capture.label}: party touch target width`).toBeGreaterThanOrEqual(44);
        expect(health.partyTarget?.height || 0, `${capture.label}: party touch target height`).toBeGreaterThanOrEqual(44);
        expect(health.forwardControl?.width || 0, `${capture.label}: forward touch target width`).toBeGreaterThanOrEqual(52);
        expect(health.forwardControl?.height || 0, `${capture.label}: forward touch target height`).toBeGreaterThanOrEqual(52);
        expect(health.attackControl?.width || 0, `${capture.label}: attack touch target width`).toBeGreaterThanOrEqual(72);
        expect(health.attackControl?.height || 0, `${capture.label}: attack touch target height`).toBeGreaterThanOrEqual(72);
        expect(health.narration?.top ?? 0, `${capture.label}: narration clears compact party`).toBeGreaterThanOrEqual(health.partyTarget?.bottom ?? 0);
        expect(health.narration?.bottom ?? capture.height, `${capture.label}: narration clears thumb controls`).toBeLessThanOrEqual(health.forwardControl?.top ?? capture.height);
      } else {
        expect(health.authoredPortrait?.width || 0, `${capture.label}: Chronicles portrait visible`).toBeGreaterThan(0);
        expect(health.authoredPortrait?.height || 0, `${capture.label}: Chronicles portrait height`).toBeGreaterThan(0);
      }

      await captureElement(page, gameRoot, `${ARTIFACT_DIR}/chronicles-playing-${capture.label}.png`);

      await page.getByRole('button', { name: 'Minimapa local. Abrir automapa completo', exact: true }).click();
      const automap = page.getByRole('dialog', { name: 'Automapa de Chronicles', exact: true });
      await expect(automap).toBeVisible();
      const automapCells = automap.locator('.chronicles-automap__cell');
      const automapMarker = automap.locator('[data-chronicles-map-facing]');
      await expect(automapCells.first()).toBeVisible();
      await expect(automapMarker).toBeVisible();
      expect(await automapCells.count(), `${capture.label}: automap reveals geometry`).toBeGreaterThanOrEqual(3);
      const markerBox = await automapMarker.boundingBox();
      const automapCanvas = automap.locator('.chronicles-automap__canvas');
      const canvasBox = await automapCanvas.boundingBox();
      expect(markerBox?.width || 0, `${capture.label}: automap marker width`).toBeGreaterThan(0);
      expect(markerBox?.height || 0, `${capture.label}: automap marker height`).toBeGreaterThan(0);
      expect(canvasBox?.height || 0, `${capture.label}: automap canvas height`).toBeGreaterThan(80);
      const markerCenterX = (markerBox?.x || 0) + (markerBox?.width || 0) / 2;
      const markerCenterY = (markerBox?.y || 0) + (markerBox?.height || 0) / 2;
      expect(markerCenterX, `${capture.label}: automap marker inside canvas horizontally`).toBeGreaterThan((canvasBox?.x || 0) + 8);
      expect(markerCenterX, `${capture.label}: automap marker inside canvas horizontally`).toBeLessThan((canvasBox?.x || 0) + (canvasBox?.width || 0) - 8);
      expect(markerCenterY, `${capture.label}: automap marker inside canvas vertically`).toBeGreaterThan((canvasBox?.y || 0) + 8);
      expect(markerCenterY, `${capture.label}: automap marker inside canvas vertically`).toBeLessThan((canvasBox?.y || 0) + (canvasBox?.height || 0) - 8);
      await captureElement(
        page,
        automap.locator('.chronicles-automap__panel'),
        `${ARTIFACT_DIR}/chronicles-automap-${capture.label}.png`,
      );
      await page.keyboard.press('m');
      await expect(automap).toHaveCount(0);

      await page.keyboard.press('Escape');
      if (!capture.hasTouch) {
        expect(
          await page.evaluate(() => document.fullscreenElement),
          `${capture.label}: desktop Escape belongs to the Chronicles menu`,
        ).toBeNull();
      }
      const openedMenu = page.locator('.chronicles-game-menu[open]');
      await expect(openedMenu).toBeVisible();
      await expect(openedMenu.getByRole('button', { name: 'Continuar', exact: true })).toBeVisible();
      await expect(openedMenu.getByRole('button', { name: 'Nueva expedición', exact: true })).toBeVisible();
      await expect(openedMenu.getByRole('button', { name: 'Salir y guardar', exact: true })).toBeVisible();
      await page.keyboard.press('Escape');
      await expect(page.locator('.chronicles-game-menu[open]')).toHaveCount(0);

      await writeFile(
        `${ARTIFACT_DIR}/chronicles-visual-health-${capture.label}.json`,
        `${JSON.stringify({ schema: 4, scope: 'chronicles', capture: { label: capture.label, ...health } }, null, 2)}\n`,
        'utf8',
      );
    } finally {
      await context.close();
    }
  });
}


test('Chronicles · initiative rail visual · desktop-1440x900', async ({ browser }) => {
  test.setTimeout(180_000);
  await mkdir(ARTIFACT_DIR, { recursive: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  try {
    await openChronicles(page, 'initiative-desktop-1440x900');
    const gameRoot = page.locator('[data-chronicles="true"]');
    await page.keyboard.press('w');
    await expect(gameRoot).toHaveAttribute('data-chronicles-phase', 'combat');
    const rail = page.locator('[data-chronicles-initiative="visible"]');
    await expect(rail).toBeVisible();
    await expect(rail.locator('li').first()).toHaveAttribute('aria-current', 'step');
    await captureElement(page, gameRoot, ARTIFACT_DIR + '/chronicles-initiative-desktop-1440x900.png');
  } finally {
    await context.close();
  }
});

test('Chronicles · initiative rail visual · android-390x844', async ({ browser }) => {
  test.setTimeout(180_000);
  await mkdir(ARTIFACT_DIR, { recursive: true });
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  const page = await context.newPage();
  try {
    await openChronicles(page, 'initiative-android-390x844');
    const gameRoot = page.locator('[data-chronicles="true"]');
    await page.keyboard.press('w');
    await expect(gameRoot).toHaveAttribute('data-chronicles-phase', 'combat');
    await expect(gameRoot).toHaveAttribute('data-chronicles-initiative-die', '1d8');
    const rail = page.locator('[data-chronicles-initiative="visible"]');
    const minimap = page.locator('[data-chronicles-minimap="visible"]');
    await expect(rail).toBeVisible();
    await expect(rail.locator('li').first()).toHaveAttribute('aria-current', 'step');
    const activeActor = await rail.getAttribute('data-active-actor');
    expect(activeActor).toBeTruthy();
    const railBox = await rail.boundingBox();
    const minimapBox = await minimap.boundingBox();
    expect(railBox).not.toBeNull();
    expect(minimapBox).not.toBeNull();
    const overlaps = !(railBox.x + railBox.width <= minimapBox.x || minimapBox.x + minimapBox.width <= railBox.x || railBox.y + railBox.height <= minimapBox.y || minimapBox.y + minimapBox.height <= railBox.y);
    expect(overlaps).toBe(false);
    await captureElement(page, gameRoot, ARTIFACT_DIR + '/chronicles-initiative-android-390x844.png');
  } finally {
    await context.close();
  }
});

test('Chronicles · Gallery of Forks first-person material proof · desktop-1440x900', async ({ browser }) => {
  test.setTimeout(180_000);
  await mkdir(ARTIFACT_DIR, { recursive: true });

  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  try {
    await openChronicles(page, 'gallery-of-forks-desktop-1440x900', {
      chroniclesCurrentMapId: 'gallery-of-forks',
      chroniclesWorldFlags: {
        galleryLeverPulled: true,
        galleryRelicCollected: false,
        enemyHp: 0,
        jailerHp: 0,
        '__chrRuntime.version': 1,
        '__chrRuntime.x': 5,
        '__chrRuntime.y': 4,
        '__chrRuntime.direction': 0,
        '__chrRuntime.phase': 'explore',
        '__chrRuntime.turnPhase': 'party',
      },
    });
    const gameRoot = page.locator('[data-chronicles="true"]');
    const canvas = page.locator('[data-chronicles-renderer="three"] canvas');
    await expect(gameRoot).toHaveAttribute('data-chronicles-map-id', 'gallery-of-forks');
    await expect(gameRoot).toHaveAttribute('data-chronicles-phase', 'explore');
    await expect(page.locator('.chronicles-statusbar')).toContainText('Recoger reliquia de ceniza');
    const contextualAction = page.getByRole('button', { name: 'Recoger reliquia de ceniza', exact: true });
    await expect(contextualAction).toBeVisible();
    await expect(canvas).toHaveCount(1, { timeout: 20_000 });
    await expect(canvas).toBeVisible();
    await page.waitForTimeout(450);

    const health = await captureChroniclesHealth(page);
    expect(health.horizontalOverflow, 'gallery-of-forks: Chronicles overflow').toBe(false);
    expect(health.gameCanvasCount, 'gallery-of-forks: dungeon canvas').toBe(1);
    await captureElement(
      page,
      gameRoot,
      `${ARTIFACT_DIR}/chronicles-gallery-of-forks-desktop-1440x900.png`,
    );
    await contextualAction.click();
    await expect(page.locator('.chronicles-statusbar')).toContainText('Abrir salida de la galería');
    await expect(page.getByRole('button', { name: 'Recoger reliquia de ceniza', exact: true })).toHaveCount(0);
  } finally {
    await context.close();
  }
});


for (const capture of CAPTURES) {
  test(`Chronicles · terminal defeat visual · ${capture.label}`, async ({ browser }) => {
    test.setTimeout(180_000);
    await mkdir(ARTIFACT_DIR, { recursive: true });

    const context = await browser.newContext({
      viewport: { width: capture.width, height: capture.height },
      hasTouch: capture.hasTouch,
      isMobile: capture.hasTouch,
    });
    const page = await context.newPage();
    try {
      await openChronicles(page, `defeat-${capture.label}`, { runStatus: 'defeated' });
      const gameRoot = page.locator('[data-chronicles="true"]');
      const defeat = page.getByRole('dialog', { name: 'Expedición terminada', exact: true });

      await expect(gameRoot).toHaveAttribute('data-chronicles-phase', 'defeated');
      await expect(defeat).toBeVisible();
      await expect(defeat.getByText('La compañía ha caído.', { exact: true })).toBeVisible();
      await expect(defeat.getByRole('button', { name: 'Nueva expedición', exact: true })).toBeVisible();
      await expect(defeat.getByRole('button', { name: 'Salir', exact: true })).toBeVisible();
      await expect(page.locator('.chronicles-touch')).toHaveCount(0);
      await expect(page.locator('.chronicles-keyboard-help')).toHaveCount(0);
      await expect(page.locator('.chronicles-party-member:not(:disabled)')).toHaveCount(0);

      const health = await captureChroniclesHealth(page);
      expect(health.horizontalOverflow, `${capture.label}: terminal Chronicles overflow`).toBe(false);
      expect(health.gameRoot?.width || 0, `${capture.label}: terminal fullscreen width`).toBeGreaterThanOrEqual(capture.width - 2);
      expect(health.gameRoot?.height || 0, `${capture.label}: terminal fullscreen height`).toBeGreaterThanOrEqual(capture.height - 2);

      await captureElement(page, gameRoot, `${ARTIFACT_DIR}/chronicles-defeated-${capture.label}.png`);
      await writeFile(
        `${ARTIFACT_DIR}/chronicles-defeated-health-${capture.label}.json`,
        `${JSON.stringify({
          schema: 1,
          scope: 'chronicles-defeated',
          capture: { label: capture.label, ...health },
        }, null, 2)}\n`,
        'utf8',
      );
    } finally {
      await context.close();
    }
  });
}

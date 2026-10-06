import { expect, test } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { confirmChroniclesCharacterSetup, login, mockApi, openMoreGameModes } from './helpers.js';

const ARTIFACT_DIR = '../.artifacts/app-visual';
const CAPTURES = [
  { label: 'desktop-1440x900', width: 1440, height: 900, hasTouch: false },
  { label: 'android-390x844', width: 390, height: 844, hasTouch: true },
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
} = {}) {
  await mockApi(page, {
    profileSeed: {
      'matthias.onboarded': '2',
      'chess-study-home-guide-dismissed-v1': '1',
    },
    chroniclesRunStatus: runStatus,
    chroniclesCurrentMapId,
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
  const chroniclesEntry = page.getByRole('button', { name: /BOOK I.*Chronicles of Matthias/i });
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
    test.setTimeout(180_000);
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
      expect(
        await page.evaluate(() => document.fullscreenElement),
        `${capture.label}: Chronicles must not enter browser-native fullscreen`,
      ).toBeNull();
      await expect(chroniclesCanvas).toHaveCount(1, { timeout: 20_000 });
      await expect(chroniclesCanvas).toBeVisible();
      await expect(authoredPortrait).toHaveCount(1, { timeout: 20_000 });
      await expect(authoredPortrait).toBeVisible();
      await expect(stage).toBeVisible();
      await expect(gameMenu).toBeVisible();
      await page.waitForTimeout(450);

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
      expect(health.stage?.width || 0, `${capture.label}: Chronicles stage visible`).toBeGreaterThan(0);
      expect(health.gameCanvas?.width || 0, `${capture.label}: Chronicles dungeon canvas visible`).toBeGreaterThan(0);
      expect(health.gameCanvas?.height || 0, `${capture.label}: Chronicles dungeon canvas height`).toBeGreaterThan(0);
      expect(health.authoredPortrait?.width || 0, `${capture.label}: Chronicles portrait visible`).toBeGreaterThan(0);
      expect(health.authoredPortrait?.height || 0, `${capture.label}: Chronicles portrait height`).toBeGreaterThan(0);

      await captureElement(page, gameRoot, `${ARTIFACT_DIR}/chronicles-playing-${capture.label}.png`);

      await page.keyboard.press('Escape');
      expect(
        await page.evaluate(() => document.fullscreenElement),
        `${capture.label}: Escape belongs to the Chronicles menu`,
      ).toBeNull();
      const openedMenu = page.locator('.chronicles-game-menu[open]');
      await expect(openedMenu).toBeVisible();
      await expect(openedMenu.getByRole('button', { name: 'Continuar', exact: true })).toBeVisible();
      await expect(openedMenu.getByRole('button', { name: 'Salir', exact: true })).toBeVisible();
      await captureElement(page, gameRoot, `${ARTIFACT_DIR}/chronicles-menu-open-${capture.label}.png`);
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


test('Chronicles · Gallery of Forks first-person material proof · desktop-1440x900', async ({ browser }) => {
  test.setTimeout(180_000);
  await mkdir(ARTIFACT_DIR, { recursive: true });

  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  try {
    await openChronicles(page, 'gallery-of-forks-desktop-1440x900', {
      chroniclesCurrentMapId: 'gallery-of-forks',
    });
    const gameRoot = page.locator('[data-chronicles="true"]');
    const canvas = page.locator('[data-chronicles-renderer="three"] canvas');
    await expect(gameRoot).toHaveAttribute('data-chronicles-map-id', 'gallery-of-forks');
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

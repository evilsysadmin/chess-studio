import { expect, test } from '@playwright/test';
import { buttonWithVisibleText, clickBoardMove, login, mockApi } from './helpers.js';

for (const viewport of [
  { width: 360, height: 800 },
  { width: 390, height: 844 },
  { width: 430, height: 932 },
]) {
  test(`Mobile golden path · Partida rápida prioriza empezar en ${viewport.width}px`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await mockApi(page, {
      profileSeed: {
        'matthias.onboarded': '2',
        'chess-study-home-guide-dismissed-v1': '1',
      },
    });
    await login(page);

    await buttonWithVisibleText(page, 'Partida rápida').click();
    const dialog = page.getByRole('dialog', { name: 'Configurar partida rápida' });
    await expect(dialog).toBeVisible();

    const start = dialog.getByRole('button', { name: 'Empezar partida', exact: true });
    const manual = dialog.getByRole('button', { name: 'Ajustar nivel', exact: true });
    const settings = dialog.locator('details.quick-match-settings > summary');

    await expect(start).toBeVisible();
    await expect(manual).toBeVisible();
    await expect(settings).toBeVisible();

    const [startBox, manualBox, settingsBox] = await Promise.all([
      start.boundingBox(),
      manual.boundingBox(),
      settings.boundingBox(),
    ]);
    expect(startBox).not.toBeNull();
    expect(manualBox).not.toBeNull();
    expect(settingsBox).not.toBeNull();

    expect(startBox.y).toBeLessThan(manualBox.y);
    expect(startBox.y).toBeLessThan(settingsBox.y);
    expect(startBox.y + startBox.height).toBeLessThanOrEqual(viewport.height + 1);
    expect(startBox.height).toBeGreaterThanOrEqual(44);
    expect(manualBox.height).toBeGreaterThanOrEqual(44);
    expect(settingsBox.height).toBeGreaterThanOrEqual(44);
    expect(startBox.x).toBeGreaterThanOrEqual(0);
    expect(startBox.x + startBox.width).toBeLessThanOrEqual(viewport.width + 1);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1)).toBe(true);
  });
}

// GP-5 (#34): con la barra del navegador el alto útil de un móvil real ronda
// 560–700 px. Con Ajustes abierto el modal debe hacer scroll y todos sus
// controles tienen que poder alcanzarse (antes `overflow: hidden` los cortaba).
test.describe('Mobile golden path · Partida rápida cabe en alto útil real', () => {
  test.use({ isMobile: true, hasTouch: true });

  for (const viewport of [
    { width: 412, height: 690 },
    { width: 360, height: 560 },
  ]) {
    test(`Ajustes abierto sigue alcanzable en ${viewport.width}x${viewport.height}`, async ({ page }) => {
      await page.setViewportSize(viewport);
      await mockApi(page, {
        profileSeed: {
          'matthias.onboarded': '2',
          'chess-study-home-guide-dismissed-v1': '1',
        },
      });
      await login(page);

      await buttonWithVisibleText(page, 'Partida rápida').click();
      const dialog = page.getByRole('dialog', { name: 'Configurar partida rápida' });
      await expect(dialog).toBeVisible();

      const start = dialog.getByRole('button', { name: 'Empezar partida', exact: true });
      const startBox = await start.boundingBox();
      expect(startBox.y + startBox.height, 'Empezar partida above the fold').toBeLessThanOrEqual(viewport.height);

      await dialog.locator('details.quick-match-settings > summary').click();
      const controls = dialog.locator('details.quick-match-settings[open] :is(button, select, input, a)');
      await expect(controls.first()).toBeVisible();
      const count = await controls.count();
      expect(count).toBeGreaterThan(0);

      // Scroll de USUARIO (rueda/gesto), no programático: un contenedor con
      // `overflow: hidden` se deja mover por scrollIntoView pero no por el dedo.
      const overflowing = await dialog.evaluate((node) => node.scrollHeight > node.clientHeight + 1);
      if (overflowing) {
        await dialog.evaluate((node) => { node.scrollTop = 0; });
        const dialogBox = await dialog.boundingBox();
        await page.mouse.move(dialogBox.x + dialogBox.width / 2, dialogBox.y + dialogBox.height / 2);
        await page.mouse.wheel(0, 2000);
        await expect.poll(() => dialog.evaluate((node) => node.scrollTop), { message: 'dialog scrolls under the finger' }).toBeGreaterThan(0);
        await expect.poll(() => dialog.evaluate((node) => Math.ceil(node.scrollTop + node.clientHeight) >= node.scrollHeight - 1)).toBe(true);
        await dialog.evaluate((node) => { node.scrollTop = 0; });
      }

      for (let index = 0; index < count; index += 1) {
        const control = controls.nth(index);
        if (!await control.isVisible()) continue;
        await control.scrollIntoViewIfNeeded();
        const [box, clip] = await Promise.all([
          control.boundingBox(),
          dialog.boundingBox(),
        ]);
        const label = `control ${index} reachable inside the dialog`;
        expect(box.y, label).toBeGreaterThanOrEqual(Math.max(0, clip.y) - 1);
        expect(box.y + box.height, label).toBeLessThanOrEqual(Math.min(viewport.height, clip.y + clip.height) + 1);
      }
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1)).toBe(true);
    });
  }
});

// GP-6/GP-8 (#34): tras ganar, un único CTA primario visible sin scroll y
// «Jugar otra partida» arranca la revancha en UN toque (colores cambiados).
test.describe('Mobile golden path · postpartida con una decisión y revancha en un toque', () => {
  test.use({ isMobile: true, hasTouch: true });

  for (const viewport of [
    { width: 390, height: 844 },
    { width: 412, height: 690 },
  ]) {
    test(`revancha en un toque en ${viewport.width}x${viewport.height}`, async ({ page }) => {
      await page.setViewportSize(viewport);
      const requestLog = [];
      await mockApi(page, {
        gameScenario: 'mate',
        requestLog,
        profileSeed: {
          'matthias.onboarded': '2',
          'chess-study-home-guide-dismissed-v1': '1',
        },
      });
      await login(page);
      await buttonWithVisibleText(page, 'Partida rápida').click();
      const setup = page.getByRole('dialog', { name: 'Configurar partida rápida' });
      await setup.locator('details.quick-match-settings > summary').click();
      await setup.getByRole('button', { name: '2D', exact: true }).click();
      await setup.getByRole('button', { name: 'Empezar partida', exact: true }).click();

      await expect(page.getByRole('button', { name: /^Casilla g6,/ })).toBeVisible({ timeout: 15_000 });
      await clickBoardMove(page, 'g6', 'g7');
      const endgame = page.getByRole('dialog').filter({ has: page.getByRole('heading', { name: /Jaque mate/i }) });
      await expect(endgame).toBeVisible({ timeout: 15_000 });

      const primary = endgame.locator('.primary-btn');
      await expect(primary).toHaveCount(1);
      await expect(primary).toHaveText('Jugar otra partida');
      const box = await primary.boundingBox();
      expect(box.y + box.height, 'primary CTA without scrolling').toBeLessThanOrEqual(viewport.height);
      expect(box.height).toBeGreaterThanOrEqual(44);

      const createsBefore = requestLog.filter((row) => row.method === 'POST' && /\/games\/?$/.test(row.path)).length;
      await primary.click();
      await expect(endgame).toBeHidden({ timeout: 15_000 });
      await expect.poll(() => requestLog.filter((row) => row.method === 'POST' && /\/games\/?$/.test(row.path)).length).toBe(createsBefore + 1);
    });
  }
});

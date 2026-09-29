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

// GP-4 (#4405): en la Home móvil el aviso de Matthias no tapa navegación ni la
// barra fija de «Jugar 1 vs 1», y su texto no queda cortado.
test.describe('Mobile golden path · Home no se pelea con el aviso de Matthias', () => {
  test.use({ isMobile: true, hasTouch: true });

  for (const viewport of [
    { width: 390, height: 844 },
    { width: 412, height: 690 },
    { width: 360, height: 640 },
  ]) {
    test(`aviso de Matthias fuera de la navegación en ${viewport.width}x${viewport.height}`, async ({ page }) => {
      await page.addInitScript(() => { Math.random = () => 0; });
      await page.setViewportSize(viewport);
      await mockApi(page, {
        profileSeed: {
          'matthias.onboarded': '2',
          'chess-study-home-guide-dismissed-v1': '1',
        },
      });
      await login(page);

      const home = page.getByRole('region', { name: 'Modos principales' });
      await expect(home).toBeVisible();
      const speech = home.getByRole('region', { name: 'Mensaje de Matthias', exact: true });
      await expect(speech).toBeVisible({ timeout: 10_000 });

      const speechBox = await speech.boundingBox();
      expect(speechBox.y, 'speech inside viewport (top)').toBeGreaterThanOrEqual(0);
      expect(speechBox.y + speechBox.height, 'speech inside viewport (bottom)').toBeLessThanOrEqual(viewport.height);
      const clipped = await speech.locator('p').evaluate((node) => node.scrollHeight > node.clientHeight + 1);
      expect(clipped, 'speech text not clipped').toBe(false);

      const targets = await page.evaluate(() => {
        const speechNode = document.querySelector('[aria-label="Mensaje de Matthias"]');
        const nodes = [...document.querySelectorAll('button, a, .home-pvp-roster-link')]
          .filter((node) => !speechNode.contains(node));
        return nodes.map((node) => {
          const box = node.getBoundingClientRect();
          return { label: (node.innerText || node.getAttribute('aria-label') || node.className || '').toString().trim().slice(0, 40), x: box.x, y: box.y, width: box.width, height: box.height };
        }).filter((box) => box.width > 0 && box.height > 0 && box.y < innerHeight && box.y + box.height > 0);
      });
      const bar = page.locator('.home-pvp-roster-link');
      if (await bar.isVisible().catch(() => false)) {
        const barBox = await bar.boundingBox();
        for (const target of targets.filter((row) => !row.label.includes('home-pvp-roster-link') && !row.label.includes('Jugar 1 vs 1'))) {
          const hidden = barBox.x < target.x + target.width
            && barBox.x + barBox.width > target.x
            && barBox.y < target.y + target.height
            && barBox.y + barBox.height > target.y;
          expect(hidden, `«${target.label}» must not hide under the fixed 1 vs 1 bar`).toBe(false);
        }
      }
      for (const target of targets) {
        const overlaps = speechBox.x < target.x + target.width
          && speechBox.x + speechBox.width > target.x
          && speechBox.y < target.y + target.height
          && speechBox.y + speechBox.height > target.y;
        expect(overlaps, `Matthias speech must not cover «${target.label}»`).toBe(false);
      }
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


test.describe('Mobile golden path · entrenar el error real en un toque', () => {
  test.use({ isMobile: true, hasTouch: true });

  test('postpartida → error factual → puzzle exacto en 390x844', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await mockApi(page, {
      gameScenario: 'foolsMateLoss',
      analysisMoves: [
        {
          suggested: { from: 'f2', to: 'f3', san: 'f3', piece: 'p' },
          evalAfterSuggested: 0,
          evalAfterPlayed: 0,
          factualEvalAfterSuggested: 0,
          factualEvalAfterPlayed: 0,
          analysisDepth: 2,
          candidateCount: 2,
        },
        {
          suggested: { from: 'e2', to: 'e4', san: 'e4', piece: 'p' },
          evalAfterSuggested: 0,
          evalAfterPlayed: -500,
          factualEvalAfterSuggested: 0,
          factualEvalAfterPlayed: -500,
          analysisDepth: 2,
          candidateCount: 2,
        },
      ],
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

    await clickBoardMove(page, 'f2', 'f3');
    await clickBoardMove(page, 'g2', 'g4');

    const endgame = page.getByRole('dialog').filter({ has: page.getByRole('heading', { name: /Jaque mate/i }) });
    await expect(endgame).toBeVisible({ timeout: 15_000 });
    const train = endgame.getByRole('button', { name: 'Entrenar este error', exact: true });
    await expect(train).toBeVisible({ timeout: 15_000 });
    await expect(endgame.locator('.primary-btn')).toHaveCount(1);
    const box = await train.boundingBox();
    expect(box.height).toBeGreaterThanOrEqual(44);
    expect(box.y + box.height).toBeLessThanOrEqual(844);

    await train.tap();
    await expect(endgame).toBeHidden({ timeout: 15_000 });
    await expect(page.getByRole('heading', { name: /Cuenta pendiente|Escena del crimen/ })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText(/Aquí jugaste g4 y perdiste/)).toBeVisible();
    await expect(page.getByRole('button', { name: /Tus errores/ })).toBeVisible();
  });
});

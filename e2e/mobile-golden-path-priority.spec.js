import { expect, test } from '@playwright/test';
import { buttonWithVisibleText, clickBoardMove, gameTurn, login, mockApi } from './helpers.js';
import { readBoard3DProjection } from './board3d-projection.js';

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
test.describe('Mobile golden path · Home portrait mantiene el camino principal limpio', () => {
  test.use({ isMobile: true, hasTouch: true });

  for (const viewport of [
    { width: 390, height: 844 },
    { width: 412, height: 690 },
    { width: 360, height: 640 },
    { width: 430, height: 932 },
  ]) {
    test(`vestíbulo limpio en ${viewport.width}x${viewport.height}`, async ({ page }) => {
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
      await expect(home.getByRole('region', { name: 'Mensaje de Matthias', exact: true })).toBeHidden();
      await expect(home.getByRole('complementary', { name: 'Rincón de Matthias' })).toBeHidden();

      const play = home.locator('.illustrated-home__destination--play');
      const more = home.locator('.illustrated-home__play-more');
      const landscape = home.locator('.illustrated-home__landscape-hint');
      for (const [label, target] of [['play', play], ['more', more], ['landscape', landscape]]) {
        await expect(target).toBeVisible();
        const box = await target.boundingBox();
        expect(box, label).not.toBeNull();
        expect(box.width, `${label} touch width`).toBeGreaterThanOrEqual(44);
        expect(box.height, `${label} touch height`).toBeGreaterThanOrEqual(44);
        expect(box.x, `${label} inside left`).toBeGreaterThanOrEqual(-1);
        expect(box.x + box.width, `${label} inside right`).toBeLessThanOrEqual(viewport.width + 1);
        expect(box.y, `${label} inside top`).toBeGreaterThanOrEqual(-1);
        expect(box.y + box.height, `${label} inside bottom`).toBeLessThanOrEqual(viewport.height + 1);
      }

      const bar = page.locator('.home-pvp-roster-link');
      if (await bar.isVisible().catch(() => false)) {
        const barBox = await bar.boundingBox();
        const playBox = await play.boundingBox();
        const overlap = barBox.x < playBox.x + playBox.width
          && barBox.x + barBox.width > playBox.x
          && barBox.y < playBox.y + playBox.height
          && barBox.y + barBox.height > playBox.y;
        expect(overlap, 'fixed 1v1 bar must not cover JUGAR/CONTINUAR').toBe(false);
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
    { width: 360, height: 640 },
    { width: 430, height: 932 },
  ]) {
    test(`revancha en un toque en ${viewport.width}x${viewport.height}`, async ({ page }, testInfo) => {
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
      await page.screenshot({ path: testInfo.outputPath(`after-postgame-${viewport.width}x${viewport.height}.png`) });

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
    // Esperar la respuesta de la CPU (e7-e5) antes de la segunda jugada: un
    // toque mientras el rival responde se ignora y el mate nunca llega.
    await expect(page.getByRole('button', { name: /^Casilla e5, (?!vacía)/ })).toBeVisible({ timeout: 15_000 });
    await expect(gameTurn(page)).toBeVisible({ timeout: 15_000 });
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

// GP-7 (#34): en el entrenamiento personal el tablero manda. Con la cámara real,
// ocupa ≥85 % del ancho, las 64 casillas caben en el canvas y todo el tablero
// queda sobre el pliegue incluso con la barra del navegador (412x690).
test.describe('Mobile golden path · entrenar el error con el tablero mandando', () => {
  test.use({ isMobile: true, hasTouch: true });

  const base = {
    kind: 'personal',
    source: 'autopsy',
    description: 'Caso real de horquilla.',
    played: 'Rb1',
    fen: '6k1/5ppp/8/8/8/8/5PPP/R5K1 w - - 0 1',
    solution: ['Ra8#'],
    incidentKeys: ['cpu:KNIGHT_FORK'],
  };
  // Un patrón necesita al menos dos posiciones reales: una pendiente y dos ya
  // entrenadas (misma forma que learning-golden-path).
  const TRAINING_SEED = JSON.stringify([
    { ...base, id: 'gp7-fork-pending', title: 'Horquilla pendiente GP-7', sourceGameId: 'gp7-3', loss: 330, createdAt: '2026-09-12T10:00:00Z', attempts: 0, solves: 0, cleanSolves: 0 },
    { ...base, id: 'gp7-fork-clean-2', title: 'Horquilla GP-7 dos', sourceGameId: 'gp7-2', loss: 260, createdAt: '2026-09-10T10:00:00Z', attempts: 1, solves: 1, cleanSolves: 1, masteredAt: '2026-09-10T10:05:00Z' },
    { ...base, id: 'gp7-fork-clean-1', title: 'Horquilla GP-7 uno', sourceGameId: 'gp7-1', loss: 210, createdAt: '2026-09-08T10:00:00Z', attempts: 1, solves: 1, cleanSolves: 1, masteredAt: '2026-09-08T10:05:00Z' },
  ]);

  for (const viewport of [
    { width: 390, height: 844 },
    { width: 412, height: 690 },
    { width: 360, height: 640 },
    { width: 430, height: 932 },
  ]) {
    test(`tablero del entrenamiento sobre el pliegue en ${viewport.width}x${viewport.height}`, async ({ page }, testInfo) => {
      test.setTimeout(90_000);
      await page.setViewportSize(viewport);
      await mockApi(page, {
        profileSeed: {
          'matthias.onboarded': '2',
          'chess-study-home-guide-dismissed-v1': '1',
          'chess-study-personal-puzzles': TRAINING_SEED,
        },
      });
      await login(page);
      const more = page.locator('.illustrated-home__play-more');
      await more.click();
      await page.getByRole('button', { name: 'Así juegas', exact: true }).click();
      await page.getByRole('tab', { name: /Errores/ }).click();
      // «Así juegas → Errores» en móvil: la pastilla de recuento no se estira.
      const count = page.locator('.insights-recurring-errors-heading > strong');
      await expect(count).toBeVisible();
      const countBox = await count.boundingBox();
      expect(countBox.height, 'pattern count pill keeps pill height').toBeLessThanOrEqual(36);
      await page.getByRole('button', { name: 'Entrenar este patrón →', exact: true }).click();
      await expect(page.getByRole('heading', { name: 'Horquilla pendiente GP-7', exact: true })).toBeVisible();

      const canvas = page.locator('.board3d-main-canvas');
      await expect(canvas).toBeVisible({ timeout: 30_000 });
      const { board, rect } = await readBoard3DProjection(canvas);
      expect(board.width / viewport.width, 'training board owns >=85% of the width').toBeGreaterThanOrEqual(0.85);
      expect(board.x, 'board inside canvas (left)').toBeGreaterThanOrEqual(rect.x - 1);
      expect(board.x + board.width, 'board inside canvas (right)').toBeLessThanOrEqual(rect.x + rect.width + 1);
      expect(board.y, 'board inside canvas (top)').toBeGreaterThanOrEqual(rect.y - 1);
      expect(board.y + board.height, 'board inside canvas (bottom)').toBeLessThanOrEqual(rect.y + rect.height + 1);
      expect(board.y + board.height, 'whole board above the fold').toBeLessThanOrEqual(viewport.height);
      await expect(page.locator('.navigation-back-hint')).toBeHidden();
      // El título queda bajo el tablero en móvil: el objetivo va con el turno,
      // encima del canvas, y saltar el puzzle no es el CTA principal.
      const turn = page.locator('.puzzle-screen .puzzle-board-column > .status-line');
      await expect(turn).toContainText('Tu turno · Jugaste Rb1: busca algo mejor');
      const turnBox = await turn.boundingBox();
      expect(turnBox.x, 'objective inside viewport (left)').toBeGreaterThanOrEqual(0);
      expect(turnBox.x + turnBox.width, 'objective inside viewport (right)').toBeLessThanOrEqual(viewport.width + 1);
      expect(turnBox.y + turnBox.height, 'objective above the board').toBeLessThanOrEqual(rect.y + 1);
      await expect(page.getByRole('button', { name: 'Siguiente puzzle', exact: true })).not.toHaveClass(/primary-btn/);
      await page.screenshot({ path: testInfo.outputPath(`after-training-${viewport.width}x${viewport.height}.png`) });
    });
  }
});

import { expect, test } from '@playwright/test';
import { buttonWithVisibleText, clickBoardMove, gameTurn, login, mockApi } from './helpers.js';

const FOOLS_MATE_START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
const FOOLS_MATE_AFTER_FIRST_PAIR = 'rnbqkbnr/pppp1ppp/8/4p3/8/5P2/PPPPP1PP/RNBQKBNR w KQkq e6 0 2';
const FOOLS_MATE_END = 'rnb1kbnr/pppp1ppp/8/4p3/6Pq/5P2/PPPPP2P/RNBQKBNR w KQkq - 1 3';

async function installFoolsMatePostGameScenario(page) {
  let game = null;
  let analysisIndex = 0;
  const analysis = [
    {
      suggested: { san: 'e4', from: 'e2', to: 'e4', piece: 'p' },
      evalAfterSuggested: 20,
      evalAfterPlayed: -40,
    },
    {
      suggested: { san: 'g3', from: 'g2', to: 'g3', piece: 'p' },
      evalAfterSuggested: -20,
      evalAfterPlayed: -900,
    },
  ];

  await page.route('http://localhost:4000/api/analyze', async (route) => {
    const result = analysis[Math.min(analysisIndex, analysis.length - 1)];
    analysisIndex += 1;
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(result) });
  });

  await page.route('http://localhost:4000/api/games**', async (route) => {
    const url = new URL(route.request().url());
    const path = url.pathname;
    const method = route.request().method();
    const json = (body, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });

    if (path.endsWith('/games') && method === 'POST') {
      const payload = route.request().postDataJSON?.() ?? {};
      game = {
        id: 'e2e-fools-mate',
        fen: FOOLS_MATE_START,
        turn: 'w',
        humanColor: payload.color === 'b' ? 'b' : 'w',
        difficulty: Math.round(Number(payload.difficulty ?? 50)),
        status: 'playing',
        insufficientMatingMaterial: { w: false, b: false },
        isGameOver: false,
        history: [],
        lastMove: null,
        initialFen: FOOLS_MATE_START,
        ghostStyle: null,
      };
      return json(game, 201);
    }

    const moveMatch = path.match(/\/games\/([^/]+)\/move$/);
    if (moveMatch && method === 'POST' && game) {
      const payload = route.request().postDataJSON?.() ?? {};
      if (game.history.length === 0 && payload.from === 'f2' && payload.to === 'f3') {
        game = {
          ...game,
          fen: FOOLS_MATE_AFTER_FIRST_PAIR,
          turn: 'w',
          history: [
            { from: 'f2', to: 'f3', san: 'f3', piece: 'p', by: 'human' },
            { from: 'e7', to: 'e5', san: 'e5', piece: 'p', by: 'cpu' },
          ],
          lastMove: { from: 'e7', to: 'e5', san: 'e5', piece: 'p', by: 'cpu' },
        };
        return json(game);
      }
      if (game.history.length === 2 && payload.from === 'g2' && payload.to === 'g4') {
        game = {
          ...game,
          fen: FOOLS_MATE_END,
          turn: 'w',
          status: 'checkmate',
          isGameOver: true,
          history: [
            ...game.history,
            { from: 'g2', to: 'g4', san: 'g4', piece: 'p', by: 'human' },
            { from: 'd8', to: 'h4', san: 'Qh4#', piece: 'q', by: 'cpu' },
          ],
          lastMove: { from: 'd8', to: 'h4', san: 'Qh4#', piece: 'q', by: 'cpu' },
        };
        return json(game);
      }
      return json({ detail: `E2E Fool's Mate no esperaba ${payload.from}-${payload.to}` }, 400);
    }

    const gameMatch = path.match(/\/games\/([^/]+)$/);
    if (gameMatch && method === 'GET') return game ? json(game) : json({ detail: 'Partida no encontrada' }, 404);
    if (gameMatch && method === 'DELETE') {
      game = null;
      return route.fulfill({ status: 204, body: '' });
    }
    return route.fallback();
  });
}

test('storage bloqueado · login y navegación básica siguen utilizables', async ({ page }) => {
  await page.addInitScript(() => {
    const originalSet = Storage.prototype.setItem;
    Storage.prototype.setItem = function patchedSetItem(key, value) {
      if (String(key).startsWith('chess-study-')) {
        const error = new DOMException('Storage blocked by compatibility test', 'SecurityError');
        throw error;
      }
      return originalSet.call(this, key, value);
    };
  });
  await mockApi(page);
  await login(page);
  await expect(page.getByRole('region', { name: 'Hoy en Chess Studio' })).toBeVisible();
  await expect(page.getByRole('button', { name: /Abrir desafíos|Ver desafíos/ })).toBeVisible();
});

test('desafíos diarios · sección propia no desborda en móvil', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await mockApi(page);
  await login(page);
  await page.getByRole('button', { name: /Abrir desafíos|Ver desafíos/ }).click();
  await expect(page.getByRole('heading', { name: 'Desafíos diarios', exact: true })).toBeVisible();
  await expect(page.getByText('0/4', { exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
});

for (const width of [360, 390, 430]) {
  test(`Home · jerarquía principal usable y sin desbordar a ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    await mockApi(page);
    await login(page);

    await expect(page.getByRole('region', { name: 'Modos principales', exact: true })).toBeVisible();
    await expect(buttonWithVisibleText(page, 'Partida rápida')).toBeVisible();
    await expect(page.getByText('Más modos de juego', { exact: true })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
  });

  test(`Mi progreso · diagnóstico visible y sin desbordar a ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    await mockApi(page);
    await login(page);
    await page.getByRole('button', { name: 'Abrir menú de cuenta', exact: true }).click();
    await page.getByRole('menuitem', { name: /Mi progreso/ }).click();
    await expect(page.getByRole('tab', { name: /Diagnóstico/ })).toHaveAttribute('aria-selected', 'true');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
  });

  test(`Home → Mi progreso · abre la carrera y sus secciones caben a ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    await mockApi(page);
    await login(page);
    const guide = page.getByRole('region', { name: 'Guía rápida de Chess Studio' });
    await guide.getByRole('button', { name: 'Ahora no', exact: true }).click();
    await page.getByRole('button', { name: 'Ver mi progreso →', exact: true }).click();

    await expect(page.getByRole('heading', { name: 'Mi progreso', exact: true })).toBeVisible();
    await expect(page.getByRole('tab', { name: /Mi progreso.*Evolución e historial/ })).toHaveAttribute('aria-selected', 'true');
    const sections = page.getByRole('navigation', { name: 'Secciones de Mi progreso' });
    await expect(sections).toBeVisible();
    expect(await sections.evaluate((node) => node.scrollWidth <= node.clientWidth + 1)).toBe(true);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
  });

  test(`War Room · viewport y controles táctiles caben a ${width}px`, async ({ page }) => {
    test.setTimeout(60_000);
    await page.setViewportSize({ width, height: 844 });
    await mockApi(page);
    await login(page);
    await buttonWithVisibleText(page, 'Partida rápida').click();
    await page.getByRole('button', { name: 'Empezar partida', exact: true }).click();
    await expect(gameTurn(page)).toBeVisible();

    await page.getByRole('button', { name: 'Cambiar apariencia y piezas del tablero', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Ajustes' });
    await dialog.getByRole('radio', { name: /3D$/ }).click();
    await dialog.getByRole('button', { name: 'Cerrar', exact: true }).click();

    const board = page.locator('[data-board3d-war-room="true"]');
    const canvas = page.locator('.board3d-main-canvas');
    const focus = page.getByRole('button', { name: 'Focus', exact: true });
    const abandon = page.getByRole('button', { name: 'Abandonar partida', exact: true });
    const appearance = page.locator('.board3d-customize');
    await expect(board).toBeVisible({ timeout: 30_000 });
    await expect(canvas).toBeVisible({ timeout: 30_000 });
    await expect(focus).toBeVisible();
    await expect(abandon).toBeVisible();
    await expect(appearance).toBeVisible();

    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
    const boardRect = await board.boundingBox();
    expect(boardRect).not.toBeNull();
    expect(boardRect.x).toBeGreaterThanOrEqual(-1);
    expect(boardRect.x + boardRect.width).toBeLessThanOrEqual(width + 1);

    for (const control of [focus, abandon, appearance]) {
      const rect = await control.boundingBox();
      expect(rect).not.toBeNull();
      expect(rect.width).toBeGreaterThanOrEqual(40);
      expect(rect.height).toBeGreaterThanOrEqual(40);
    }

    await focus.click();
    await expect(page.locator('.game-layout')).toHaveAttribute('data-mobile-focus', 'true');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
    const exit = page.getByRole('button', { name: 'Salir del modo Focus', exact: true });
    await expect(exit).toBeVisible();
    const exitRect = await exit.boundingBox();
    expect(exitRect).not.toBeNull();
    expect(exitRect.width).toBeGreaterThanOrEqual(40);
    expect(exitRect.height).toBeGreaterThanOrEqual(40);
    await exit.click();
    await expect(page.locator('.game-layout')).toHaveAttribute('data-mobile-focus', 'false');
  });
}

test('Postpartida · autopsia y Examen caben a 360/390/430 sin spoilers ni targets diminutos', async ({ page }) => {
  test.setTimeout(60_000);
  await page.setViewportSize({ width: 390, height: 844 });
  await mockApi(page);
  await installFoolsMatePostGameScenario(page);
  await login(page);
  await buttonWithVisibleText(page, 'Partida rápida').click();
  await page.getByRole('button', { name: 'Empezar partida', exact: true }).click();
  await expect(gameTurn(page)).toBeVisible();

  await clickBoardMove(page, 'f2', 'f3');
  await expect(gameTurn(page)).toBeVisible();
  await clickBoardMove(page, 'g2', 'g4');

  const endgame = page.locator('.endgame-dialog');
  await expect(endgame).toBeVisible();
  await expect(endgame.getByText('PARTIDA FINALIZADA', { exact: true })).toBeVisible();
  const reportButton = endgame.getByRole('button', { name: 'Resumen de la partida', exact: true });
  await expect(reportButton).toBeVisible();

  for (const width of [360, 390, 430]) {
    await page.setViewportSize({ width, height: 844 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
    const rect = await endgame.boundingBox();
    expect(rect).not.toBeNull();
    expect(rect.x).toBeGreaterThanOrEqual(-1);
    expect(rect.x + rect.width).toBeLessThanOrEqual(width + 1);
    const buttonRect = await reportButton.boundingBox();
    expect(buttonRect).not.toBeNull();
    expect(buttonRect.height).toBeGreaterThanOrEqual(40);
  }

  await page.setViewportSize({ width: 390, height: 844 });
  await reportButton.click();
  const report = page.getByRole('dialog', { name: 'Resumen de la partida' });
  await expect(report).toBeVisible();
  await expect(report.getByText('Precisión estimada', { exact: true })).toBeVisible({ timeout: 15_000 });
  const examIntro = report.locator('[data-post-game-exam="ready"]');
  await expect(examIntro).toBeVisible();
  await expect(examIntro.getByText('EXAMEN // SIN PISTAS', { exact: true })).toBeVisible();
  await expect(examIntro).not.toContainText('g4');
  await expect(examIntro).not.toContainText('g3');

  const close = report.getByRole('button', { name: 'Cerrar', exact: true });
  const fullAutopsy = report.locator('details.autopsy-full-details');
  for (const width of [360, 390, 430]) {
    await page.setViewportSize({ width, height: 844 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
    const rect = await report.boundingBox();
    expect(rect).not.toBeNull();
    expect(rect.x).toBeGreaterThanOrEqual(-1);
    expect(rect.x + rect.width).toBeLessThanOrEqual(width + 1);
    const closeRect = await close.boundingBox();
    expect(closeRect).not.toBeNull();
    expect(closeRect.width).toBeGreaterThanOrEqual(40);
    expect(closeRect.height).toBeGreaterThanOrEqual(40);
  }

  await fullAutopsy.locator('summary').click();
  await expect(fullAutopsy).toHaveAttribute('open', '');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);

  const startExam = examIntro.getByRole('button', { name: 'Hacer examen', exact: true });
  await startExam.click();
  const activeExam = report.locator('[data-post-game-exam="active"]');
  await expect(activeExam).toBeVisible();
  await expect(activeExam.getByText('Sin pista.', { exact: true })).toBeVisible();
  await expect(activeExam).not.toContainText('g4');
  await expect(activeExam).not.toContainText('g3');

  for (const width of [360, 390, 430]) {
    await page.setViewportSize({ width, height: 844 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
    const board = activeExam.locator('.post-game-exam-board');
    const boardRect = await board.boundingBox();
    expect(boardRect).not.toBeNull();
    expect(boardRect.x).toBeGreaterThanOrEqual(-1);
    expect(boardRect.x + boardRect.width).toBeLessThanOrEqual(width + 1);
  }

  await page.setViewportSize({ width: 390, height: 844 });
  await clickBoardMove(page, 'g2', 'g3', activeExam);
  await expect(activeExam.getByText('✓ Correcto.', { exact: true })).toBeVisible();
  await expect(activeExam).toContainText('En la partida jugaste g4');
  await expect(activeExam).toContainText('La alternativa era g3');
  const resultButton = activeExam.getByRole('button', { name: 'Ver resultado', exact: true });
  const resultRect = await resultButton.boundingBox();
  expect(resultRect).not.toBeNull();
  expect(resultRect.height).toBeGreaterThanOrEqual(40);
  await resultButton.click();
  await expect(report.locator('[data-post-game-exam="finished"]')).toContainText('1/1 a la primera');

  await page.keyboard.press('Escape');
  await expect(report).toHaveCount(0);
});

test('Home · la guía inicial no bloquea, recuerda el cierre y puede reabrirse', async ({ page }) => {
  await mockApi(page);
  await login(page);

  const guide = page.getByRole('region', { name: 'Guía rápida de Chess Studio' });
  await expect(guide).toBeVisible();
  await guide.getByRole('button', { name: 'Ahora no', exact: true }).click();
  await expect(guide).toHaveCount(0);

  await page.reload();
  await expect(guide).toHaveCount(0);
  await page.getByRole('button', { name: /Retomar guía/ }).click();
  await expect(guide).toBeVisible();
  await expect(guide.getByRole('button', { name: /^Entra en la Escuela de Matthias\./ })).toBeVisible();
});

test('Home · cuenta y cierre de sesión son acciones accesibles', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await mockApi(page);
  await login(page);

  await page.getByRole('button', { name: 'Abrir menú de cuenta', exact: true }).click();
  await expect(page.getByRole('menuitem', { name: /Mi cuenta/ })).toBeVisible();
  await expect(page.getByRole('menuitem', { name: /Personalizar/ })).toBeVisible();
  await expect(page.getByRole('menuitem', { name: /Cerrar sesión/ })).toBeVisible();
  await page.getByRole('region', { name: 'Guía rápida de Chess Studio' }).getByRole('button', { name: 'Ahora no', exact: true }).click();
  await page.getByRole('button', { name: 'Abrir asistente de feedback' }).click();
  const assistant = page.getByRole('complementary', { name: 'Asistente de feedback' });
  await expect(assistant).toBeVisible();
  await assistant.getByRole('button', { name: 'Dar feedback', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Dinos qué mejorar' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
});

test('Home · Combat abre un resumen compacto del ejército', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await mockApi(page);
  await login(page);
  await page.getByRole('button', { name: /Estado de Combat: rango/i }).click();
  const summary = page.getByRole('dialog', { name: 'Tu ejército' });
  await expect(summary).toBeVisible();
  await expect(summary.getByText('Créditos disponibles', { exact: true })).toBeVisible();
  await expect(summary.getByText('veteranos', { exact: true })).toBeVisible();
  await expect(summary.getByRole('button', { name: 'Ver ejército', exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
});

test('Registro · permite elegir inglés y localiza el acceso', async ({ page }) => {
  await mockApi(page);
  await page.goto('/');
  await page.getByRole('button', { name: '¿No tienes cuenta? Créala', exact: true }).click();
  await page.getByLabel('Idioma', { exact: true }).selectOption('en');
  await expect(page.getByRole('heading', { name: 'Create account', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Create account', exact: true })).toBeVisible();
});

test('Partida · la mesa principal no expone PGN ni una franja avanzada', async ({ page }) => {
  await mockApi(page);
  await login(page);
  await buttonWithVisibleText(page, 'Partida rápida').click();
  await page.getByRole('button', { name: 'Empezar partida', exact: true }).click();

  await expect(gameTurn(page)).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Chess Studio', exact: true })).toHaveCount(0);
  await expect(page.locator('.player-status-bar')).toHaveCount(0);
  await expect(page.locator('.square-coordinate')).toHaveCount(16);
  await expect(page.locator('.rank-labels, .file-labels')).toHaveCount(0);
  await expect(page.getByText('Opciones avanzadas', { exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Exportar archivo .pgn', exact: true })).toHaveCount(0);
});

test('Laboratorio · FEN sólo aparece dentro de opciones avanzadas', async ({ page }) => {
  await mockApi(page);
  await login(page);
  await page.getByText('Más modos de juego', { exact: true }).click();
  await buttonWithVisibleText(page, 'Laboratorio').click();

  await expect(page.getByRole('heading', { name: 'Prepara una posición y juega', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: /FEN/ })).toHaveCount(0);
  await page.getByText('Opciones avanzadas de la posición', { exact: true }).click();
  await expect(page.getByRole('button', { name: 'Importar posición en formato FEN', exact: true })).toBeVisible();
});

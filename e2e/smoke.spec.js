import { expect, test } from '@playwright/test';
import { buttonWithHeading, buttonWithVisibleText, clickBoardMove, dismissTutorialIfVisible, gameTurn, login, mockApi, openCampaignBriefing, openCampaignMap, openDeployment } from './helpers.js';

test('login → menú → Así juegas → refresh → ESC conserva navegación', async ({ page }) => {
  await mockApi(page);
  await login(page);

  await expect(page.getByText('2 usuarios online', { exact: true })).toHaveCount(0);
  await buttonWithVisibleText(page, 'Así juegas').click();
  await expect(page.getByRole('heading', { name: 'Así juegas', exact: true })).toBeVisible();

  await page.reload();
  await expect(page.getByRole('heading', { name: 'Así juegas', exact: true })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('heading', { name: 'Torneo', exact: true })).toBeVisible();
});


test('Partida rápida · una partida activa sobrevive a reload/deploy y vuelve al tablero', async ({ page }) => {
  await mockApi(page);
  await login(page);

  await buttonWithVisibleText(page, 'Partida rápida').click();
  await expect(page.getByRole('heading', { name: 'Elige dificultad y juega', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Empezar partida', exact: true }).click();
  await expect(gameTurn(page)).toBeVisible();

  await page.reload();
  await expect(gameTurn(page)).toBeVisible();
  await expect(page.getByText('Restaurando partida en curso…', { exact: true })).toHaveCount(0);
  await expect(buttonWithVisibleText(page, 'Partida rápida')).toHaveCount(0);
});

test('Torneo · una partida activa sobrevive a reload y no vuelve al menú', async ({ page }) => {
  await mockApi(page);
  await login(page);

  await buttonWithHeading(page, 'Torneo').click();
  await expect(page.getByRole('heading', { name: 'Siguiente rival', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Jugar siguiente partida', exact: true }).click();
  await expect(gameTurn(page)).toBeVisible();

  await page.reload();
  await expect(gameTurn(page)).toBeVisible();
  await expect(page.getByRole('region', { name: 'Hoy en Chess Studio' })).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Siguiente rival', exact: true })).toHaveCount(0);
});


test('Partida rápida · un 503 al restaurar conserva la ruta y permite reintentar sin caer a Home', async ({ page }) => {
  // Dos fallos hacen determinista el contrato: el primero rompe la restauración
  // inicial y el segundo la reconciliación automática. Así el botón manual no
  // desaparece por una carrera antes de que Playwright pueda pulsarlo.
  await mockApi(page, { gameGetFailures: 2 });
  await login(page);

  await buttonWithVisibleText(page, 'Partida rápida').click();
  await page.getByRole('button', { name: 'Empezar partida', exact: true }).click();
  await expect(gameTurn(page)).toBeVisible();

  await page.reload();
  await expect(page.getByText('La partida sigue guardada.', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Reintentar recuperación', exact: true })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Hoy en Chess Studio' })).toHaveCount(0);
  await expect(buttonWithVisibleText(page, 'Partida rápida')).toHaveCount(0);

  await page.getByRole('button', { name: 'Reintentar recuperación', exact: true }).click();
  await expect(gameTurn(page)).toBeVisible();
});


test('admin · clicar usuarios online abre el Panel Admin', async ({ page }) => {
  await mockApi(page, { isAdmin: true });
  await login(page);

  const online = page.getByRole('button', { name: '2 usuarios online', exact: true });
  await expect(online).toBeVisible();
  await online.click();
  await expect(page.getByRole('heading', { name: 'Usuarios registrados', exact: true })).toBeVisible();
});


test('Combat Chess · Campaña abre el mapa estratégico y mantiene la intel oculta', async ({ page }) => {
  await mockApi(page);
  await login(page);

  const map = await openCampaignMap(page);
  await expect(map.getByText(/CPU \d+/i)).toHaveCount(0);

  const availableRoute = map.getByRole('button', { name: /Elegir esta ruta/ }).first();
  await expect(availableRoute).toBeVisible();
  await availableRoute.click();
  await dismissTutorialIfVisible(page);

  await expect(page.getByLabel('Resumen táctico')).toBeVisible();
  await expect(page.getByText('Sin reconocimiento', { exact: true })).toBeVisible();
  await expect(page.getByText('CPU exacta', { exact: true })).toHaveCount(0);
});


test('Combat Chess · mapa conserva art y todos los nodos dentro del lienzo', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await mockApi(page);
  await login(page);

  const mapRegion = await openCampaignMap(page);
  const canvas = mapRegion.locator('.combat-campaign-map');
  const art = canvas.locator('.campaign-map-art');
  await expect(canvas).toBeVisible();
  await expect(art).toBeVisible();

  const background = await art.evaluate((element) => getComputedStyle(element).backgroundImage);
  expect(background).not.toBe('none');

  const geometry = await canvas.evaluate((element) => {
    const outer = element.getBoundingClientRect();
    const box = (node) => {
      const rect = node.getBoundingClientRect();
      return { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom };
    };
    const nodes = [...element.querySelectorAll('.campaign-map-point')].map(box);
    const decisions = [...element.querySelectorAll('.campaign-route-decision')].map(box);
    return { outer: { left: outer.left, right: outer.right, top: outer.top, bottom: outer.bottom }, nodes, decisions };
  });
  expect(geometry.nodes.length).toBeGreaterThan(8);
  for (const item of [...geometry.nodes, ...geometry.decisions]) {
    expect(item.left).toBeGreaterThanOrEqual(geometry.outer.left - 1);
    expect(item.right).toBeLessThanOrEqual(geometry.outer.right + 1);
    expect(item.top).toBeGreaterThanOrEqual(geometry.outer.top - 1);
    expect(item.bottom).toBeLessThanOrEqual(geometry.outer.bottom + 1);
  }
});

test('Combat Chess · Campaña permite jugar con defaults en un clic y deja el despliegue manual opcional', async ({ page }) => {
  await mockApi(page);
  await login(page);
  await openCampaignBriefing(page);

  await page.getByRole('button', { name: /PREPARAR EJÉRCITO/i }).click();
  await dismissTutorialIfVisible(page);
  await expect(page.getByLabel('Resumen de preparación')).toBeVisible();
  await expect(page.getByRole('button', { name: /Personalizar despliegue/i })).toBeVisible();

  const quick = page.getByRole('button', { name: /JUGAR CON (ESTA|FORMACIÓN RECOMENDADA)/i });
  await expect(quick).toBeVisible();
  await quick.click();
  await expect(page.getByRole('complementary', { name: 'Registro de batalla y estado táctico' })).toBeVisible();
});


test('Mesa de Guerra · hover abre ficha y doble clic mueve Tablero ↔ Banquillo', async ({ page }) => {
  await mockApi(page);
  await login(page);
  await openCampaignBriefing(page);
  const deployment = await openDeployment(page);

  const pawnSquare = deployment.getByRole('button', { name: /Casilla a2,/ });
  const pawn = pawnSquare.locator('img.piece.piece-event-target');
  await expect(pawn).toBeVisible();

  await pawn.hover();
  await expect(page.getByRole('dialog', { name: /Ficha de unidad de/i })).toBeVisible();
  await page.keyboard.press('Escape');

  await pawn.dblclick();
  await expect(deployment.getByText('Banquillo · 1', { exact: true })).toBeVisible();
  await expect(pawnSquare.locator('img.piece')).toHaveCount(0);

  const reserve = deployment.locator('.deployment-reserve-list .deployment-unit-card').first();
  await expect(reserve).toBeVisible();
  await reserve.dblclick();
  await expect(deployment.getByText('Banquillo · 0', { exact: true })).toBeVisible();
  await expect(pawnSquare.locator('img.piece.piece-event-target')).toBeVisible();
});


test('Combat Chess · una batalla activa sobrevive a reload y no vuelve a Setup', async ({ page }) => {
  await mockApi(page);
  await login(page);
  await openCampaignBriefing(page);
  await page.getByRole('button', { name: /PREPARAR EJÉRCITO/i }).click();
  await dismissTutorialIfVisible(page);
  const quick = page.getByRole('button', { name: /JUGAR CON (ESTA|FORMACIÓN RECOMENDADA)/i });
  await expect(quick).toBeVisible();
  await quick.click();
  await expect(page.getByRole('complementary', { name: 'Registro de batalla y estado táctico' })).toBeVisible();

  await page.reload();
  await expect(page.getByRole('complementary', { name: 'Registro de batalla y estado táctico' })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Preparar despliegue de Combat Chess' })).toHaveCount(0);
});


test('Mesa de Guerra · clic simple fija la ficha sin mover la unidad', async ({ page }) => {
  await mockApi(page);
  await login(page);
  await openCampaignBriefing(page);
  const deployment = await openDeployment(page);

  const pawnSquare = deployment.getByRole('button', { name: /Casilla a2,/ });
  const pawn = pawnSquare.locator('img.piece.piece-event-target');
  await expect(pawn).toBeVisible();
  await pawn.click();

  const dossier = page.getByRole('dialog', { name: /Ficha de unidad de/i });
  await expect(dossier).toBeVisible();
  await expect(dossier.getByText(/Fijada/i)).toBeVisible();
  await expect(pawnSquare.locator('img.piece.piece-event-target')).toBeVisible();
  await expect(deployment.getByText('Banquillo · 0', { exact: true })).toBeVisible();
});


test('Combat Chess · la batalla usa el rail derecho como Registro de batalla', async ({ page }) => {
  await mockApi(page);
  await login(page);
  await openCampaignBriefing(page);
  const deployment = await openDeployment(page);
  await deployment.getByRole('button', { name: 'CONFIRMAR DESPLIEGUE', exact: true }).click();
  await page.getByRole('button', { name: /INICIAR COMBATE/i }).click();

  const rail = page.getByRole('complementary', { name: 'Registro de batalla y estado táctico' });
  await expect(rail).toBeVisible();
  await expect(rail.getByRole('heading', { name: 'Registro de batalla', exact: true })).toBeVisible();
  await expect(page.getByText(/Chat de partida/i)).toHaveCount(0);
});


test('móvil 360/390/430px · Home y briefing Combat no desbordan horizontalmente', async ({ page }) => {
  const widths = [360, 390, 430];
  await page.setViewportSize({ width: 390, height: 844 });
  await mockApi(page);
  await login(page);

  await expect(page.getByRole('region', { name: 'Hoy en Chess Studio' })).toBeVisible();
  for (const width of widths) {
    await test.step(`Home ${width}px`, async () => {
      await page.setViewportSize({ width, height: 844 });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
    });
  }

  await openCampaignBriefing(page);
  await expect(page.getByLabel('Resumen táctico')).toBeVisible();
  for (const width of widths) {
    await test.step(`Briefing Combat ${width}px`, async () => {
      await page.setViewportSize({ width, height: 844 });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
    });
  }
});


test('cuenta nueva · Login y bienvenida inicial son claros y no desbordan en móvil', async ({ page }) => {
  const widths = [360, 390, 430];
  await page.setViewportSize({ width: 390, height: 844 });
  await mockApi(page);
  await page.goto('./');

  for (const width of widths) {
    await test.step(`Login ${width}px`, async () => {
      await page.setViewportSize({ width, height: 844 });
      await expect(page.getByRole('heading', { name: 'Iniciar sesión', exact: true })).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
    });
  }

  await page.getByLabel('Usuario').fill('e2e');
  await page.getByLabel('Contraseña').fill('clave123456');
  await page.getByRole('button', { name: 'Entrar' }).click();
  const guide = page.getByRole('region', { name: 'Guía rápida de Chess Studio' });
  await expect(guide).toBeVisible();
  await expect(guide.getByRole('heading', { name: 'Tres pasos y ya sabes dónde está todo.', exact: true })).toBeVisible();
  await expect(buttonWithHeading(page, 'Torneo')).toHaveClass(/home-onboarding-target/);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);

  await guide.getByRole('button', { name: 'Jugar primer rival', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Siguiente rival', exact: true })).toBeVisible();
});

test('móvil 390px · Admin sigue legible y sin overflow global', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await mockApi(page, { isAdmin: true });
  await login(page);
  await page.getByRole('button', { name: '2 usuarios online', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Usuarios registrados', exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
});


test('Combat Chess · salir al menú conserva campaña y batalla activas', async ({ page }) => {
  await mockApi(page);
  await login(page);
  await openCampaignBriefing(page);
  await page.getByRole('button', { name: /PREPARAR EJÉRCITO/i }).click();
  await dismissTutorialIfVisible(page);
  const quick = page.getByRole('button', { name: /JUGAR CON (ESTA|FORMACIÓN RECOMENDADA)/i });
  await expect(quick).toBeVisible();
  await quick.click();
  await expect(page.getByRole('complementary', { name: 'Registro de batalla y estado táctico' })).toBeVisible();

  const abandon = page.getByRole('button', { name: 'Abandonar batalla y asumir bajas', exact: true });
  await expect(abandon).toBeVisible();
  page.once('dialog', async (dialog) => {
    expect(dialog.message()).toContain('¿Abandonar batalla y asumir bajas?');
    await dialog.dismiss();
  });
  await abandon.click();
  await expect(page.getByRole('complementary', { name: 'Registro de batalla y estado táctico' })).toBeVisible();

  await page.getByRole('button', { name: 'Salir al menú', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Hoy en Chess Studio' })).toBeVisible();

  await buttonWithVisibleText(page, 'Combat Chess · Campaña').click();
  await expect(page.getByRole('complementary', { name: 'Registro de batalla y estado táctico' })).toBeVisible();
  await expect(page.getByRole('button', { name: /Empezar campaña/i })).toHaveCount(0);
});

test('Partida rápida · las 64 casillas mantienen una geometría uniforme y el chat acompaña la mesa', async ({ page }) => {
  await mockApi(page);
  await login(page);
  await buttonWithVisibleText(page, 'Partida rápida').click();
  await page.getByRole('button', { name: 'Empezar partida', exact: true }).click();
  await expect(gameTurn(page)).toBeVisible();

  const geometry = await page.locator('.game-screen .board-grid > .square').evaluateAll((squares) => squares.map((square) => {
    const rect = square.getBoundingClientRect();
    return { width: rect.width, height: rect.height };
  }));
  expect(geometry).toHaveLength(64);
  const widths = geometry.map((item) => item.width);
  const heights = geometry.map((item) => item.height);
  expect(Math.max(...widths) - Math.min(...widths)).toBeLessThan(0.2);
  expect(Math.max(...heights) - Math.min(...heights)).toBeLessThan(0.2);
  expect(Math.abs(widths[0] - heights[0])).toBeLessThan(0.2);

  const boardStack = page.locator('.game-screen .game-board-stack');
  const chatRail = page.getByRole('complementary', { name: 'Chat de partida' });
  const [boardBox, chatBox] = await Promise.all([boardStack.boundingBox(), chatRail.boundingBox()]);
  expect(boardBox).not.toBeNull();
  expect(chatBox).not.toBeNull();
  expect(Math.abs(boardBox.height - chatBox.height)).toBeLessThan(2);
});

test('Home · Feedback abre y envía sin tumbar la pantalla ni deformar la cabecera', async ({ page }) => {
  await mockApi(page);
  await login(page);
  const trigger = page.getByRole('button', { name: 'Enviar feedback' });
  const before = await trigger.boundingBox();
  expect(before).not.toBeNull();

  await trigger.click();
  const dialog = page.getByRole('dialog', { name: 'Dinos qué mejorar' });
  await expect(dialog).toBeVisible();
  await dialog.getByLabel('¿Qué pasó o qué cambiarías?').fill('Feedback E2E sin romper la pantalla.');
  await dialog.getByRole('button', { name: 'Enviar feedback' }).click();
  await expect(dialog.getByRole('heading', { name: 'Feedback enviado. Gracias.' })).toBeVisible();
  await dialog.getByRole('button', { name: 'Cerrar' }).click();
  await expect(dialog).toBeHidden();

  const after = await trigger.boundingBox();
  expect(after).not.toBeNull();
  expect(Math.abs(after.width - before.width)).toBeLessThan(1);
  expect(Math.abs(after.height - before.height)).toBeLessThan(1);
});

test('Home · Feedback, Mi cuenta y Novedades comparten geometría de control', async ({ page }) => {
  await mockApi(page);
  await login(page);
  const feedback = page.getByRole('button', { name: 'Enviar feedback' });
  const account = page.getByRole('button', { name: 'Abrir menú de cuenta' });
  const news = page.getByRole('button', { name: /Abrir novedades/ });
  const boxes = await Promise.all([feedback.boundingBox(), account.boundingBox(), news.boundingBox()]);
  expect(boxes.every(Boolean)).toBe(true);
  const widths = boxes.map((box) => box.width);
  const heights = boxes.map((box) => box.height);
  expect(Math.max(...widths) - Math.min(...widths)).toBeLessThan(1);
  expect(Math.max(...heights) - Math.min(...heights)).toBeLessThan(1);
});


test('desktop 1440x900 · Partida completa cabe en viewport y la botonera comparte geometría', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await mockApi(page);
  await login(page);
  await buttonWithVisibleText(page, 'Partida rápida').click();
  await page.getByRole('button', { name: 'Empezar partida', exact: true }).click();
  await expect(gameTurn(page)).toBeVisible();
  await clickBoardMove(page, 'e2', 'e4');
  await expect(gameTurn(page)).toBeVisible();
  await expect(page.getByText('Opciones avanzadas', { exact: true })).toBeVisible();

  const fit = await page.evaluate(() => {
    const shell = document.querySelector('.app-shell-board-game');
    const board = document.querySelector('.game-screen .game-board-stack');
    const controls = document.querySelector('.game-screen .game-command-deck');
    const side = document.querySelector('.game-screen .game-side-column');
    if (!shell || !board || !controls || !side) return null;
    const boardRect = board.getBoundingClientRect();
    const controlsRect = controls.getBoundingClientRect();
    const sideRect = side.getBoundingClientRect();
    return {
      pageFits: document.documentElement.scrollHeight <= window.innerHeight + 2,
      boardBottom: boardRect.bottom,
      controlsBottom: controlsRect.bottom,
      sideBottom: sideRect.bottom,
      viewport: window.innerHeight,
    };
  });
  expect(fit).not.toBeNull();
  expect(fit.pageFits).toBe(true);
  expect(fit.boardBottom).toBeLessThanOrEqual(fit.viewport + 1);
  expect(fit.controlsBottom).toBeLessThanOrEqual(fit.viewport + 1);
  expect(fit.sideBottom).toBeLessThanOrEqual(fit.viewport + 1);

  const buttons = page.locator('.game-screen .game-controls button:visible');
  const heights = await buttons.evaluateAll((nodes) => nodes.map((node) => node.getBoundingClientRect().height));
  expect(heights.length).toBeGreaterThanOrEqual(2);
  expect(Math.max(...heights) - Math.min(...heights)).toBeLessThan(1);
});

test('desktop 1366x768 · Partida compacta conserva tablero, jugador y acciones dentro del viewport', async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 768 });
  await mockApi(page);
  await login(page);
  await buttonWithVisibleText(page, 'Partida rápida').click();
  await page.getByRole('button', { name: 'Empezar partida', exact: true }).click();
  await expect(gameTurn(page)).toBeVisible();
  await clickBoardMove(page, 'e2', 'e4');
  await expect(gameTurn(page)).toBeVisible();
  await expect(page.getByText('Opciones avanzadas', { exact: true })).toBeVisible();

  const bottomRail = page.locator('.game-screen .game-player-rail.is-human');
  const controls = page.locator('.game-screen .game-command-deck');
  await expect(bottomRail).toBeVisible();
  await expect(controls).toBeVisible();
  let [railBox, controlsBox] = await Promise.all([bottomRail.boundingBox(), controls.boundingBox()]);
  expect(railBox.bottom).toBeLessThanOrEqual(769);
  expect(controlsBox.bottom).toBeLessThanOrEqual(769);

  await page.setViewportSize({ width: 1280, height: 720 });
  [railBox, controlsBox] = await Promise.all([bottomRail.boundingBox(), controls.boundingBox()]);
  expect(railBox.bottom).toBeLessThanOrEqual(721);
  expect(controlsBox.bottom).toBeLessThanOrEqual(721);
  expect(await page.evaluate(() => document.documentElement.scrollHeight <= window.innerHeight + 2)).toBe(true);
});

test('desktop 1440x900 · Combat mantiene mesa y acciones coherentes dentro del viewport', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await mockApi(page);
  await login(page);
  await openCampaignBriefing(page);
  await page.getByRole('button', { name: /PREPARAR EJÉRCITO/i }).click();
  await dismissTutorialIfVisible(page);
  const quick = page.getByRole('button', { name: /JUGAR CON (ESTA|FORMACIÓN RECOMENDADA)/i });
  await expect(quick).toBeVisible();
  await quick.click();
  await expect(page.getByRole('complementary', { name: 'Registro de batalla y estado táctico' })).toBeVisible();

  const board = page.locator('.combat-battle-screen .game-board-stack');
  const controls = page.locator('.combat-game-controls');
  const [boardBox, controlsBox] = await Promise.all([board.boundingBox(), controls.boundingBox()]);
  expect(boardBox).not.toBeNull();
  expect(controlsBox).not.toBeNull();
  expect(boardBox.bottom).toBeLessThanOrEqual(901);
  expect(controlsBox.bottom).toBeLessThanOrEqual(901);

  const heights = await controls.locator('button:visible').evaluateAll((nodes) => nodes.map((node) => node.getBoundingClientRect().height));
  expect(heights.length).toBeGreaterThanOrEqual(2);
  expect(Math.max(...heights) - Math.min(...heights)).toBeLessThan(1);
});


test('Onboarding Home · el siguiente paso se señala y navegar no descarta la guía', async ({ page }) => {
  await mockApi(page);
  await login(page);

  const guide = page.getByRole('region', { name: 'Guía rápida de Chess Studio' });
  await expect(guide).toBeVisible();
  await expect(guide.getByText(/PRIMEROS 60 SEGUNDOS/)).toBeVisible();

  const tournament = buttonWithHeading(page, 'Torneo');
  await expect(tournament).toHaveClass(/home-onboarding-target/);
  await expect(tournament.getByText('PASO 1/3 · SIGUIENTE', { exact: true })).toBeVisible();

  await guide.getByRole('button', { name: 'Jugar primer rival', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Siguiente rival', exact: true })).toBeVisible();

  await page.keyboard.press('Escape');
  await expect(page.getByRole('region', { name: 'Guía rápida de Chess Studio' })).toBeVisible();
});


test('Home · un 503 al iniciar partida deja un error visible junto a la acción, no en el footer', async ({ page }) => {
  await mockApi(page, { gameCreateFailures: 1 });
  await login(page);

  await buttonWithVisibleText(page, 'Partida rápida').click();
  await page.getByRole('button', { name: 'Empezar partida', exact: true }).click();

  const dialog = page.getByRole('dialog', { name: 'Configurar partida rápida' });
  await expect(dialog).toBeVisible();
  const alert = dialog.getByRole('alert');
  await expect(alert).toContainText('Chess Studio ha tenido un problema');
  await expect(dialog.getByRole('button', { name: 'Empezar partida', exact: true })).toBeEnabled();
});


test('resiliencia · un 503 después de persistir create reusa Idempotency-Key y no duplica partida', async ({ page }) => {
  const requests = [];
  await mockApi(page, { gameCreateCommitThenFailures: 1, requestLog: requests });
  await login(page);

  await buttonWithVisibleText(page, 'Partida rápida').click();
  const dialog = page.getByRole('dialog', { name: 'Configurar partida rápida' });
  await dialog.getByRole('button', { name: 'Empezar partida', exact: true }).click();
  await expect(dialog.getByRole('alert')).toBeVisible();

  await dialog.getByRole('button', { name: 'Empezar partida', exact: true }).click();
  await expect(gameTurn(page)).toBeVisible();

  const creates = requests.filter((item) => item.method === 'POST' && item.path.endsWith('/api/games'));
  expect(creates).toHaveLength(2);
  expect(creates[0].idempotencyKey).toBeTruthy();
  expect(creates[1].idempotencyKey).toBe(creates[0].idempotencyKey);
});


test('golden journey · onboarding → partida/reload → mate → puzzle → Combat/reload', async ({ page }) => {
  await page.addInitScript(() => { Math.random = () => 0; });
  await mockApi(page, { gameScenario: 'mate' });
  await login(page);

  const guide = page.getByRole('region', { name: 'Guía rápida de Chess Studio' });
  await expect(guide).toBeVisible();
  await expect(buttonWithHeading(page, 'Torneo')).toHaveClass(/home-onboarding-target/);
  await guide.getByRole('button', { name: 'Ahora no', exact: true }).click();

  await buttonWithVisibleText(page, 'Partida rápida').click();
  await page.getByRole('dialog', { name: 'Configurar partida rápida' })
    .getByRole('button', { name: 'Empezar partida', exact: true }).click();
  await expect(gameTurn(page)).toBeVisible();
  await page.reload();
  await expect(gameTurn(page)).toBeVisible();

  await clickBoardMove(page, 'g6', 'g7');
  const endgame = page.getByRole('dialog').filter({ has: page.getByRole('heading', { name: 'Jaque mate', exact: true }) });
  await expect(endgame).toBeVisible();
  await expect(endgame.getByText('¡Ganaste la partida!', { exact: true })).toBeVisible();
  await endgame.getByRole('button', { name: 'Volver al menú', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Hoy en Chess Studio' })).toBeVisible();

  const learningMore = page.locator('details.home-learning-more');
  if (!(await learningMore.evaluate((node) => node.open))) await learningMore.locator('summary').click();
  await learningMore.getByRole('button').filter({ has: learningMore.getByRole('heading', { name: 'Puzzles', exact: true }) }).click();
  await expect(page.getByText('Mate en 1', { exact: true }).first()).toBeVisible();
  await clickBoardMove(page, 'a1', 'a8');
  await expect(page.getByText('¡Resuelto!', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: '← Volver al menú', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Hoy en Chess Studio' })).toBeVisible();

  await openCampaignBriefing(page);
  await page.getByRole('button', { name: /PREPARAR EJÉRCITO/i }).click();
  await dismissTutorialIfVisible(page);
  const quick = page.getByRole('button', { name: /JUGAR CON (ESTA|FORMACIÓN RECOMENDADA)/i });
  await expect(quick).toBeVisible();
  await quick.click();
  await expect(page.getByRole('complementary', { name: 'Registro de batalla y estado táctico' })).toBeVisible();

  await page.reload();
  await expect(page.getByRole('complementary', { name: 'Registro de batalla y estado táctico' })).toBeVisible();
  await expect(page.locator('.error-boundary-screen')).toHaveCount(0);
});


test('resiliencia · jugada persistida con respuesta perdida se reintenta sin doble movimiento', async ({ page }) => {
  const requests = [];
  await mockApi(page, { gameScenario: 'opening', moveCommitThenFailures: 1, requestLog: requests });
  await login(page);
  await buttonWithVisibleText(page, 'Partida rápida').click();
  await page.getByRole('dialog', { name: 'Configurar partida rápida' })
    .getByRole('button', { name: 'Empezar partida', exact: true }).click();
  await expect(gameTurn(page)).toBeVisible();

  await clickBoardMove(page, 'e2', 'e4');
  await expect(page.getByRole('button', { name: /^Casilla e2, peón blanco/i })).toBeVisible();

  await clickBoardMove(page, 'e2', 'e4');
  await expect(page.getByRole('button', { name: /^Casilla e4, peón blanco/i })).toBeVisible();
  await expect(page.getByRole('button', { name: /^Casilla e5, peón negro/i })).toBeVisible();

  const moves = requests.filter((item) => item.method === 'POST' && /\/api\/games\/[^/]+\/move$/.test(item.path));
  expect(moves).toHaveLength(2);
  expect(moves[0].idempotencyKey).toBeTruthy();
  expect(moves[1].idempotencyKey).toBe(moves[0].idempotencyKey);
});

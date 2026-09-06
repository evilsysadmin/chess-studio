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

  const warRoomMatthias = page.getByRole('complementary', { name: 'Puesto táctico de Matthias' });
  if (await warRoomMatthias.isVisible().catch(() => false)) {
    await expect(warRoomMatthias.getByRole('heading', { name: 'Matthias', exact: true })).toBeVisible();
    await expect(warRoomMatthias.locator('[data-matthias-war-room-presence="king-piece"]')).toBeVisible();
    await expect(warRoomMatthias.locator('[data-three-face-rig="face-v1"]')).toHaveCount(0);
  } else {
    // Explicit 2D remains a supported user preference; its player rail may
    // still use the canonical CPU portrait because Matthias is not embodied
    // as the 3D king in that renderer.
    const matthiasAvatar = page.locator('.game-player-rail.is-cpu .game-player-avatar.has-portrait img');
    await expect(matthiasAvatar).toBeVisible();
    expect(await matthiasAvatar.evaluate((img) => img.naturalWidth)).toBeGreaterThan(0);
  }

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
  await expect(guide.getByRole('heading', { name: 'Guten Morgen. Soy Matthias.', exact: true })).toBeVisible();
  await expect(guide.getByText(/mayor cabronazo ajedrecista.*Tajo/i)).toBeVisible();
  await expect(buttonWithHeading(page, 'Torneo')).toHaveClass(/home-onboarding-target/);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);

  await guide.getByRole('button', { name: /^Juega una partida\./ }).click();
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

  // SPA transition: the click completes before an unrelated scheduled navigation.
  // Do not let Playwright's implicit navigation wait turn a successful re-entry into a false failure.
  await buttonWithVisibleText(page, 'Combat Chess · Campaña').click({ noWaitAfter: true });
  await expect(page.getByRole('complementary', { name: 'Registro de batalla y estado táctico' })).toBeVisible({ timeout: 20000 });
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

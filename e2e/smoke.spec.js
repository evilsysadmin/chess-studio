import { expect, test } from '@playwright/test';
import { buttonWithHeading, buttonWithVisibleText, dismissTutorialIfVisible, login, mockApi, openCampaignBriefing, openCampaignMap, openDeployment } from './helpers.js';

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
  await expect(page.getByText('Tu turno', { exact: true })).toBeVisible();

  await page.reload();
  await expect(page.getByText('Tu turno', { exact: true })).toBeVisible();
  await expect(page.getByText('Restaurando partida en curso…', { exact: true })).toHaveCount(0);
  await expect(buttonWithVisibleText(page, 'Partida rápida')).toHaveCount(0);
});

test('Torneo · una partida activa sobrevive a reload y no vuelve al menú', async ({ page }) => {
  await mockApi(page);
  await login(page);

  await buttonWithHeading(page, 'Torneo').click();
  await expect(page.getByRole('heading', { name: 'Siguiente rival', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Jugar siguiente partida', exact: true }).click();
  await expect(page.getByText('Tu turno', { exact: true })).toBeVisible();

  await page.reload();
  await expect(page.getByText('Tu turno', { exact: true })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Hoy en Chess Studio' })).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Siguiente rival', exact: true })).toHaveCount(0);
});


test('Partida rápida · un 503 al restaurar conserva la ruta y permite reintentar sin caer a Home', async ({ page }) => {
  await mockApi(page, { gameGetFailures: 1 });
  await login(page);

  await buttonWithVisibleText(page, 'Partida rápida').click();
  await page.getByRole('button', { name: 'Empezar partida', exact: true }).click();
  await expect(page.getByText('Tu turno', { exact: true })).toBeVisible();

  await page.reload();
  await expect(page.getByText('La partida sigue guardada.', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Reintentar recuperación', exact: true })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Hoy en Chess Studio' })).toHaveCount(0);
  await expect(buttonWithVisibleText(page, 'Partida rápida')).toHaveCount(0);

  await page.getByRole('button', { name: 'Reintentar recuperación', exact: true }).click();
  await expect(page.getByText('Tu turno', { exact: true })).toBeVisible();
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
  await expect(page.getByText(/Game Chat/i)).toHaveCount(0);
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
  await expect(page.getByRole('heading', { name: 'Tres pasos y ya sabes dónde está todo.', exact: true })).toBeVisible();
  await expect(page.getByText('No necesitas aprender todos los modos ahora.', { exact: false })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);

  await page.getByRole('button', { name: 'Jugar primer rival', exact: true }).click();
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

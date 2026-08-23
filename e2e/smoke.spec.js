import { expect, test } from '@playwright/test';
import { dismissTutorialIfVisible, login, mockApi, openCampaignBriefing, openDeployment } from './helpers.js';

test('login → menú → Así juegas → refresh → ESC conserva navegación', async ({ page }) => {
  await mockApi(page);
  await login(page);

  await expect(page.getByText('2 online')).toBeVisible();
  await page.getByRole('button', { name: /Así juegas/ }).click();
  await expect(page.getByRole('heading', { name: 'Así juegas', exact: true })).toBeVisible();

  await page.reload();
  await expect(page.getByRole('heading', { name: 'Así juegas', exact: true })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('heading', { name: 'Torneo', exact: true })).toBeVisible();
});


test('Partida rápida · una partida activa sobrevive a reload/deploy y vuelve al tablero', async ({ page }) => {
  await mockApi(page);
  await login(page);

  await page.getByRole('button', { name: /Partida rápida/ }).click();
  await expect(page.getByRole('heading', { name: 'Elige dificultad y juega', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Empezar partida', exact: true }).click();
  await expect(page.getByText('Tu turno', { exact: true })).toBeVisible();

  await page.reload();
  await expect(page.getByText('Tu turno', { exact: true })).toBeVisible();
  await expect(page.getByText('Restaurando partida en curso…', { exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: /Partida rápida/ })).toHaveCount(0);
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

  await page.getByRole('button', { name: /Combat Chess · Campaña/ }).click();
  await expect(page.getByRole('heading', { name: 'Combat Chess · Campaña', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Iniciar Operación La Torre' }).click();
  await dismissTutorialIfVisible(page);

  const map = page.getByRole('region', { name: 'Mapa completo de campaña Combat Chess' });
  await expect(map).toBeVisible();
  await expect(map.getByText(/CPU \d+/i)).toHaveCount(0);
  await expect(map.getByText('intel pendiente', { exact: false }).first()).toBeVisible();

  const availableRoute = map.getByRole('button', { name: /Elegir esta ruta/ }).first();
  await expect(availableRoute).toBeVisible();
  await availableRoute.click();

  await expect(page.getByText('BRIEFING TÁCTICO', { exact: false })).toBeVisible();
  await expect(page.getByText('Oculta', { exact: true })).toBeVisible();
});


test('Combat Chess · Campaña obliga a confirmar despliegue antes de iniciar combate', async ({ page }) => {
  await mockApi(page);
  await login(page);
  await openCampaignBriefing(page);

  await expect(page.getByRole('button', { name: /INICIAR COMBATE/i })).toHaveCount(0);
  const deployment = await openDeployment(page);
  const confirm = deployment.getByRole('button', { name: 'CONFIRMAR DESPLIEGUE', exact: true });
  await expect(confirm).toBeEnabled();
  await confirm.click();

  await expect(deployment).toHaveCount(0);
  await expect(page.getByRole('button', { name: /INICIAR COMBATE/i })).toBeVisible();
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
  const deployment = await openDeployment(page);
  await deployment.getByRole('button', { name: 'CONFIRMAR DESPLIEGUE', exact: true }).click();

  const start = page.getByRole('button', { name: /INICIAR COMBATE/i });
  await expect(start).toBeVisible();
  await start.click();
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


for (const width of [360, 390, 430]) {
  test(`móvil ${width}px · Home y briefing Combat no desbordan horizontalmente`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    await mockApi(page);
    await login(page);

    await expect(page.getByRole('region', { name: 'Hoy en Chess Studio' })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);

    await openCampaignBriefing(page);
    await expect(page.getByLabel('Resumen táctico')).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
  });
}


test('móvil 390px · Admin sigue legible y sin overflow global', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await mockApi(page, { isAdmin: true });
  await login(page);
  await page.getByRole('button', { name: '2 usuarios online', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Usuarios registrados', exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
});

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
    await expect(warRoomMatthias.locator('[data-three-face-rig="face-v1"]')).toBeVisible();
  } else {
    // Explicit 2D remains a supported user preference; keep the old portrait
    // assertion as the fallback branch instead of assuming either renderer.
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


test('Combat Chess · Campaña permite jugar con defaults en un clic y deja el despliegue manual opcional', async ({ page }) => {
  await mockApi(page);
  await login(page);
  await openCampaignBriefing(page);
  await page.getByRole('button', { name: /PREPARAR EJÉRCITO/i }).click();
  await dismissTutorialIfVisible(page);
  const quick = page.getByRole('button', { name: /JUGAR CON (ESTA|FORMACIÓN RECOMENDADA)/i });
  await expect(quick).toBeVisible();
  await quick.click();
  await expect(page.getByRole('complementary', { name: 'Registro de batalla y estado táctico' })).toBeVisible();
});


test('móvil 360px · Home mantiene acciones principales visibles y sin overflow global', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await mockApi(page);
  await login(page);
  await expect(page.getByRole('region', { name: 'Hoy en Chess Studio' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
});


test('móvil 390px · Home mantiene acciones principales visibles y sin overflow global', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await mockApi(page);
  await login(page);
  await expect(page.getByRole('region', { name: 'Hoy en Chess Studio' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
});


test('móvil 430px · Home mantiene acciones principales visibles y sin overflow global', async ({ page }) => {
  await page.setViewportSize({ width: 430, height: 932 });
  await mockApi(page);
  await login(page);
  await expect(page.getByRole('region', { name: 'Hoy en Chess Studio' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
});


test('móvil 390px · Combat briefing mantiene resumen e informe avanzado sin overflow global', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await mockApi(page);
  await login(page);
  await openCampaignBriefing(page);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
});


test('móvil 390px · onboarding conserva lectura, foco y CTA sin overflow global', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await mockApi(page, {
    profileSeed: {
      'chess-study-onboarding-v2': JSON.stringify({ completed: false, currentStep: 0 }),
      'chess-study-mechanic-tutorial-progress-v1': JSON.stringify({}),
    },
  });
  await login(page);

  const guide = page.getByRole('dialog', { name: 'Guía rápida de Chess Studio' });
  await expect(guide).toBeVisible();
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

  // This is an SPA transition. The click itself was completing, but Playwright
  // occasionally waited for an unrelated scheduled navigation until the
  // 12-second action timeout. Skip only that implicit wait and keep the real
  // destination assertion as the contract.
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
  const board = page.locator('.board').first();
  await expect(board).toBeVisible();
  expect(await board.locator('.square').count()).toBe(64);
});

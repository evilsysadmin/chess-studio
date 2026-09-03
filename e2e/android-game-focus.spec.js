import { devices, expect, test } from '@playwright/test';
import { buttonWithVisibleText, login, mockApi } from './helpers.js';

test.use({ ...devices['Pixel 5'] });

function movePosts(requestLog) {
  return requestLog.filter((entry) => entry.method === 'POST' && /\/games\/[^/]+\/move$/.test(entry.path));
}

async function startQuickGame(page, requestLog, mockOptions = {}) {
  await mockApi(page, { requestLog, ...mockOptions });
  await login(page);
  await buttonWithVisibleText(page, 'Partida rápida').click();
  await page.getByRole('button', { name: 'Empezar partida', exact: true }).click();

  // Mobile follows the same product contract as desktop: a fresh quick game
  // lands directly in War Room. Waiting for the actual renderer avoids coupling
  // readiness to a status strip that compact layouts are allowed to fold away.
  await expect(page.locator('[data-board3d-war-room="true"]')).toBeVisible({ timeout: 30_000 });
  await expect(page.locator('.board3d-main-canvas')).toBeVisible({ timeout: 30_000 });
}

test('Android · Focus deja sólo el tablero 3D, sigue siendo jugable y puede salir', async ({ page }) => {
  const requestLog = [];
  await startQuickGame(page, requestLog);

  const focus = page.getByRole('button', { name: 'Focus', exact: true });
  await expect(focus).toBeVisible();
  await focus.click();

  const layout = page.locator('.game-layout');
  const board3d = page.locator('[data-board3d-war-room="true"]');
  const canvas = page.locator('.board3d-main-canvas');
  await expect(layout).toHaveAttribute('data-mobile-focus', 'true');
  await expect(page.locator('body')).toHaveClass(/game-mobile-focus-active/);
  await expect(page.locator('.app-shell-board-game > .masthead')).toBeHidden();
  await expect(page.locator('.global-music-dock')).toBeHidden();
  await expect(page.locator('.game-player-rail')).toHaveCount(0);
  await expect(page.locator('.game-side-column')).toHaveCount(0);
  await expect(page.locator('.game-command-deck')).toHaveCount(0);

  const exit = page.getByRole('button', { name: 'Salir del modo Focus', exact: true });
  await expect(exit).toBeVisible();
  await expect(board3d).toBeVisible();
  await expect(canvas).toBeVisible();

  // Board3D starts keyboard focus at e1 for White. The same selection/move
  // state used by touch remains live in Focus; e1→e2 selects the pawn, then
  // e2→e4 sends exactly one real move.
  await canvas.focus();
  await canvas.press('ArrowUp');
  await expect(board3d).toHaveAttribute('data-board3d-focused', 'e2');
  await canvas.press('Enter');
  await expect(board3d).toHaveAttribute('data-board3d-selected', 'e2');
  await expect.poll(async () => Number(await board3d.getAttribute('data-board3d-legal-target-count'))).toBeGreaterThan(0);
  await canvas.press('ArrowUp');
  await canvas.press('ArrowUp');
  await expect(board3d).toHaveAttribute('data-board3d-focused', 'e4');
  await canvas.press('Enter');
  await expect.poll(() => movePosts(requestLog).length).toBe(1);

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);

  await exit.click();
  await expect(layout).toHaveAttribute('data-mobile-focus', 'false');
  await expect(page.locator('body')).not.toHaveClass(/game-mobile-focus-active/);
  await expect(page.locator('.app-shell-board-game > .masthead')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Focus', exact: true })).toBeVisible();
});

test('Android · Focus convierte comentarios nuevos de Matthias en bocadillos temporales', async ({ page }) => {
  test.setTimeout(30_000);
  const requestLog = [];
  let releaseOpeningNarrative;
  let openingNarrativeRequested = false;
  const openingNarrativeGate = new Promise((resolve) => { releaseOpeningNarrative = resolve; });
  const remoteFocusLine = 'Focus activo. Ahora sí te estoy hablando desde dentro.';

  await mockApi(page, { requestLog });

  // The opening request has a real 4.5 s product timeout. The old E2E waited
  // for the whole Three canvas before entering Focus, so CI legitimately timed
  // the request out and installed the local fallback *before* Focus. Hold the
  // remote response only long enough to prove the request exists, enter Focus
  // immediately, then release a unique Cloudflare line. If that exact line
  // becomes a bubble, the message was born after Focus became authoritative.
  await page.route('http://localhost:4000/api/narrative', async (route) => {
    const payload = route.request().postDataJSON?.() ?? {};
    if (payload.eventType !== 'game_opening_banter') return route.fallback();
    openingNarrativeRequested = true;
    await openingNarrativeGate;
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        text: remoteFocusLine,
        provider: 'cloudflare',
        latencyMs: 35,
      }),
    });
  });

  await login(page);
  await buttonWithVisibleText(page, 'Partida rápida').click();
  await page.getByRole('button', { name: 'Empezar partida', exact: true }).click();

  await expect.poll(() => openingNarrativeRequested, {
    timeout: 3_000,
    message: 'La pulla inicial debe arrancar antes del timeout remoto de producto',
  }).toBe(true);

  const focus = page.getByRole('button', { name: 'Focus', exact: true });
  await expect(focus).toBeVisible({ timeout: 3_000 });
  await expect(focus).toBeEnabled();
  // El primer test ya acredita el click de usuario real. Aquí el contrato bajo
  // prueba es comentario-nuevo→bocadillo; WebGL puede retener el chequeo de
  // actionability de Playwright más de los 4,5 s del timeout remoto real.
  // Disparamos el mismo handler por DOM en cuanto el control está disponible
  // para no convertir el timeout de red en parte accidental de este test.
  await focus.evaluate((element) => element.click());
  const layout = page.locator('.game-layout');
  await expect(layout).toHaveAttribute('data-mobile-focus', 'true', { timeout: 3_000 });

  releaseOpeningNarrative();

  const bubble = page.getByRole('status', { name: 'Comentario de Matthias en Focus' });
  await expect(bubble).toBeVisible({ timeout: 6_000 });
  await expect(bubble).toContainText('MATTHIAS');
  await expect(bubble).toContainText(remoteFocusLine);
  await expect(page.locator('.game-side-column')).toHaveCount(0);

  // El bocadillo es un popup, no un panel permanente.
  await expect(bubble).toBeHidden({ timeout: 7_000 });
  await expect(page.getByRole('button', { name: 'Salir del modo Focus', exact: true })).toBeVisible();
});

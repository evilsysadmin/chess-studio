import { devices, expect, test } from '@playwright/test';
import { buttonWithVisibleText, gameTurn, login, mockApi } from './helpers.js';

test.use({ ...devices['Pixel 5'] });

function movePosts(requestLog) {
  return requestLog.filter((entry) => entry.method === 'POST' && /\/games\/[^/]+\/move$/.test(entry.path));
}

function rivalryWithTwoLosses() {
  return JSON.stringify({
    version: 3,
    totalGames: 2,
    record: {
      games: 2,
      wins: 0,
      draws: 0,
      losses: 2,
      currentStreak: -2,
      bestHumanStreak: 0,
      bestCpuStreak: 2,
      incidents: {},
      recentGames: [],
      milestones: {},
      byTimeControl: {},
      byOpening: {},
      memories: [],
    },
    incidents: {},
  });
}

async function startQuickGame(page, requestLog, mockOptions = {}) {
  await mockApi(page, { requestLog, ...mockOptions });
  await login(page);
  await buttonWithVisibleText(page, 'Partida rápida').click();
  await page.getByRole('button', { name: 'Empezar partida', exact: true }).click();
  await expect(gameTurn(page)).toBeVisible();
}

test('Android · Focus deja sólo el tablero, sigue siendo jugable y puede salir', async ({ page }) => {
  const requestLog = [];
  await startQuickGame(page, requestLog);

  const focus = page.getByRole('button', { name: 'Focus', exact: true });
  await expect(focus).toBeVisible();
  await focus.click();

  const layout = page.locator('.game-layout');
  await expect(layout).toHaveAttribute('data-mobile-focus', 'true');
  await expect(page.locator('body')).toHaveClass(/game-mobile-focus-active/);
  await expect(page.locator('.app-shell-board-game > .masthead')).toBeHidden();
  await expect(page.locator('.global-music-dock')).toBeHidden();
  await expect(page.locator('.game-player-rail')).toHaveCount(0);
  await expect(page.locator('.game-side-column')).toHaveCount(0);
  await expect(page.locator('.game-command-deck')).toHaveCount(0);

  const exit = page.getByRole('button', { name: 'Salir del modo Focus', exact: true });
  await expect(exit).toBeVisible();
  await expect(page.locator('.board-wrap')).toBeVisible();

  const e2 = page.getByRole('button', { name: /^Casilla e2, peón blanco/i });
  const e4 = page.getByRole('button', { name: /^Casilla e4,/i });
  await e2.click();
  await expect(e2).toHaveClass(/selected/);
  await e4.click();
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
  await startQuickGame(page, requestLog, {
    profileSeed: {
      'chess-study-cpu-rivalry': rivalryWithTwoLosses(),
    },
  });

  await page.getByRole('button', { name: 'Focus', exact: true }).click();
  await expect(page.locator('.game-layout')).toHaveAttribute('data-mobile-focus', 'true');

  // Dos derrotas consecutivas hacen que startMemoryComment produzca una frase
  // determinista a los 700 ms. Entramos en Focus antes de ese callback: ese
  // comentario NUEVO debe convertirse en bocadillo, sin depender de azar ni de
  // que exista un saludo genérico en esta partida concreta.
  const bubble = page.getByRole('status', { name: 'Comentario de Matthias en Focus' });
  await expect(bubble).toBeVisible({ timeout: 6_000 });
  await expect(bubble).toContainText('MATTHIAS');
  await expect(bubble).toContainText('2 derrotas consecutivas');
  await expect(page.locator('.game-side-column')).toHaveCount(0);

  // El bocadillo es un popup, no un panel permanente.
  await expect(bubble).toBeHidden({ timeout: 7_000 });
  await expect(page.getByRole('button', { name: 'Salir del modo Focus', exact: true })).toBeVisible();
});
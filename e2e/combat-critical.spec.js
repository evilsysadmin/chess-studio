import { expect, test } from '@playwright/test';
import {
  clickBoardMove,
  login,
  mockApi,
  openCampaignBriefing,
  openFreeCombat,
  seedCombatBattleSnapshot,
} from './helpers.js';

const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
const CHECK_START_FEN = '7k/8/8/8/8/8/4Q3/7K w - - 0 1';
const MATE_START_FEN = '7k/8/5KQ1/8/8/8/8/8 w - - 0 1';

test.describe('Combat Chess · jugadas críticas reales', () => {
  test('jugada humana → turno CPU → vuelve al humano sin busy eterno ni retry', async ({ page }) => {
    await mockApi(page);
    await login(page);
    await seedCombatBattleSnapshot(page, { fen: START_FEN });
    await openFreeCombat(page);

    const rail = page.getByRole('complementary', { name: 'Registro de batalla y estado táctico' });
    await expect(rail).toBeVisible();
    await expect(page.locator('[data-combat-war-room="generic"] [data-board3d-war-room="true"]')).toBeVisible({ timeout: 45_000 });
    await expect(page.locator('.board3d-main-canvas')).toBeVisible({ timeout: 45_000 });
    await clickBoardMove(page, 'e2', 'e4');

    await expect(page.locator('.combat-battle-screen .status-line')).toHaveText('Tu turno', { timeout: 5_000 });
    await expect(page.getByRole('button', { name: 'Reintentar turno de la CPU', exact: true })).toHaveCount(0);
    await expect(page.locator('.error-boundary-screen')).toHaveCount(0);
    await expect(page.getByRole('region', { name: 'Hoy en Chess Studio' })).toHaveCount(0);
  });

  test('jaque se mantiene visible durante el pensamiento de CPU dentro de la War Room', async ({ page }) => {
    await mockApi(page);
    await login(page);
    await seedCombatBattleSnapshot(page, { fen: CHECK_START_FEN });
    await openFreeCombat(page);

    await clickBoardMove(page, 'e2', 'e8');
    await expect(page.locator('.combat-battle-screen .status-line')).toContainText('Jaque');
    await expect(page.locator('[data-combat-war-room="generic"] [data-board3d-war-room="true"]')).toBeVisible({ timeout: 45_000 });
    await expect(page.locator('.error-boundary-screen')).toHaveCount(0);
  });

  test('mate termina Combat, no dispara turno CPU zombi y no vuelve a Home', async ({ page }) => {
    await mockApi(page);
    await login(page);
    await seedCombatBattleSnapshot(page, { fen: MATE_START_FEN });
    await openFreeCombat(page);

    await clickBoardMove(page, 'g6', 'g7');
    const endgame = page.locator('.combat-battle-screen .endgame-banner');
    await expect(endgame.getByRole('heading', { name: 'Jaque mate', exact: true })).toBeVisible();
    await expect(endgame.getByText('¡Has ganado el combate!', { exact: true })).toBeVisible();
    await page.waitForTimeout(800); // cualquier callback CPU viejo ya habría despertado
    await expect(page.getByRole('button', { name: 'Reintentar turno de la CPU', exact: true })).toHaveCount(0);
    await expect(page.locator('.error-boundary-screen')).toHaveCount(0);
    await expect(page.getByRole('region', { name: 'Hoy en Chess Studio' })).toHaveCount(0);
  });
});

test('Combat Chess · Campaña · primera jugada completa un ciclo humano/CPU sin perder la operación', async ({ page }) => {
  await mockApi(page);
  await login(page);

  const campaign = page.getByRole('button').filter({ has: page.getByText('Combat Chess · Campaña', { exact: true }) });
  await campaign.click();
  await page.getByRole('button', { name: /Empezar campaña/i }).click();
  const map = page.getByRole('region', { name: 'Mapa completo de campaña Combat Chess' });
  await expect(map).toBeVisible();
  await map.getByRole('button', { name: /Elegir esta ruta/ }).first().click();
  const prepare = page.getByRole('button', { name: /PREPARAR EJÉRCITO/i });
  await expect(prepare).toBeVisible();
  await prepare.click();
  const quick = page.getByRole('button', { name: /¡ENTRAR EN COMBATE!|ORGANIZAR Y COMBATIR/i });
  await expect(quick).toBeVisible();
  await quick.click();
  await expect(page.getByRole('complementary', { name: 'Registro de batalla y estado táctico' })).toBeVisible();
  await expect(page.locator('[data-combat-war-room="generic"] [data-board3d-war-room="true"]')).toBeVisible({ timeout: 45_000 });

  await clickBoardMove(page, 'e2', 'e4');
  await expect(page.locator('.combat-battle-screen .status-line')).toHaveText('Tu turno', { timeout: 5_000 });
  await expect(page.getByRole('button', { name: 'Reintentar turno de la CPU', exact: true })).toHaveCount(0);
  await expect(page.getByRole('region', { name: 'Hoy en Chess Studio' })).toHaveCount(0);
  await expect(page.locator('.error-boundary-screen')).toHaveCount(0);
});

test('Campaña · jaque mate deja la War Room visible hasta Ver debriefing', async ({ page }) => {
  test.setTimeout(90_000);
  await mockApi(page);
  await login(page);
  await openCampaignBriefing(page);
  await page.getByRole('button', { name: /PREPARAR EJÉRCITO/i }).click();
  const start = page.getByRole('button', { name: /¡ENTRAR EN COMBATE!|ORGANIZAR Y COMBATIR/i });
  await expect(start).toBeVisible();
  await start.click();
  await expect(page.locator('.combat-battle-screen')).toBeVisible({ timeout: 45_000 });

  const sessionId = await page.evaluate(() => {
    const campaign = JSON.parse(localStorage.getItem('chess-study-combat-campaign-v1') || '{}');
    return `campaign:${campaign.seed}:${campaign.selectedNodeId}`;
  });
  expect(sessionId).toMatch(/^campaign:.+:.+$/);
  await seedCombatBattleSnapshot(page, { sessionId, fen: MATE_START_FEN });
  await page.reload();
  const board = page.locator('[data-combat-war-room="generic"] [data-board3d-war-room="true"]');
  await expect(board).toBeVisible({ timeout: 45_000 });

  await clickBoardMove(page, 'g6', 'g7');
  const reveal = page.getByRole('region', { name: 'Resultado de la batalla' });
  await expect(reveal.getByRole('heading', { name: 'JAQUE MATE' })).toBeVisible({ timeout: 20_000 });
  await expect(board).toBeVisible();
  await expect(reveal.getByRole('button', { name: /Ver debriefing/ })).toBeVisible();
  await reveal.getByRole('button', { name: /Ver debriefing/ }).click();
  await expect(board).toHaveCount(0);
  const debrief = page.getByRole('region', { name: 'Informe postcombate' });
  await expect(debrief).toBeVisible({ timeout: 15_000 });
  await expect(debrief.getByRole('heading', { name: 'VICTORIA' })).toBeVisible();
  await expect(debrief.locator('details.combat-debrief-score-details')).not.toHaveAttribute('open');
});

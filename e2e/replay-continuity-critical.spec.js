import { expect, test } from '@playwright/test';
import { login, mockApi } from './helpers.js';

const ARCHIVED_QUICK_GAME = {
  id: 'replay-refresh-e2e',
  sourceGameId: 'game-replay-refresh-e2e',
  outcome: 'win',
  mode: 'casual',
  humanColor: 'w',
  difficulty: 48,
  date: '2026-08-29T12:00:00Z',
  moves: [
    { san: 'e4', from: 'e2', to: 'e4', piece: 'p' },
    { san: 'e5', from: 'e7', to: 'e5', piece: 'p' },
    { san: 'Nf3', from: 'g1', to: 'f3', piece: 'n' },
    { san: 'Nc6', from: 'b8', to: 'c6', piece: 'n' },
  ],
};

async function dismissHomeGuide(page) {
  const guide = page.getByRole('region', { name: 'Guía rápida de Chess Studio' });
  if (await guide.isVisible().catch(() => false)) {
    await guide.getByRole('button', { name: 'Ahora no', exact: true }).click();
  }
}

test('login → menú → Historial → replay → F5 vuelve a Historial', async ({ page }) => {
  await mockApi(page, { profileSeed: {
    'chess-study-game-history': JSON.stringify([ARCHIVED_QUICK_GAME]),
    'matthias.onboarded': '2',
    'chess-study-home-guide-dismissed-v1': '1',
  } });
  await login(page);
  await dismissHomeGuide(page);

  const tools = page.locator('details.home-learning-more');
  if (!(await tools.evaluate((node) => node.open))) await tools.locator('summary').click();
  await tools.getByRole('button').filter({ has: tools.getByRole('heading', { name: 'Historial', exact: true }) }).click();

  await expect(page.getByRole('heading', { name: 'Historial de partidas', exact: true })).toBeVisible();
  await expect(page.locator('.history-row')).toHaveCount(1);
  await page.locator('.history-row').first().click();

  await expect(page.getByRole('button', { name: '← Volver al historial', exact: true })).toBeVisible();
  await expect(page.locator('.error-boundary-screen')).toHaveCount(0);

  await page.reload();

  await expect(page.getByRole('heading', { name: 'Historial de partidas', exact: true })).toBeVisible();
  await expect(page.locator('.history-row')).toHaveCount(1);
  await expect(page.getByRole('button', { name: '← Volver al historial', exact: true })).toHaveCount(0);
  await expect(page.getByRole('region', { name: 'Hoy en Chess Studio' })).toHaveCount(0);
  await expect(page.locator('.error-boundary-screen')).toHaveCount(0);
});

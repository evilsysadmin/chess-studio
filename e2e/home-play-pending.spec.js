import { expect, test } from '@playwright/test';
import { login, mockApi } from './helpers.js';

test.use({ viewport: { width: 1672, height: 941 } });

const CUP_RUN = JSON.stringify({ id: 'cup-e2e', mode: 'cup', active: true, stage: 2, completedStages: 2, wins: 2, draws: 0, losses: 0, points: 0, difficulty: 55, totalGames: 8, processedGameIds: [] });

test('JUGAR · «A medias» sólo aparece cuando hay un modo empezado', async ({ page }) => {
  await mockApi(page);
  await login(page);
  const home = page.getByRole('region', { name: 'Modos principales' });
  const more = home.getByRole('button', { name: /Más formas de jugar/ });
  await more.click();
  await expect(home.getByRole('group', { name: 'A medias' })).toHaveCount(0);
});

test('JUGAR · «A medias» muestra el modo especial empezado, con su progreso', async ({ page }) => {
  await mockApi(page, { profileSeed: { 'chess-study-special-run': CUP_RUN } });
  await login(page);
  const home = page.getByRole('region', { name: 'Modos principales' });
  await home.getByRole('button', { name: /Más formas de jugar/ }).click();
  const pending = home.getByRole('group', { name: 'A medias' });
  await expect(pending).toBeVisible();
  const item = pending.getByRole('button', { name: /Continuar · Modo especial · Copa/ });
  await expect(item).toContainText('Partida 3 de 8');
});

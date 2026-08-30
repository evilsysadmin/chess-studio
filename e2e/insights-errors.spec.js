import { expect, test } from '@playwright/test';
import { buttonWithHeading, login, mockApi } from './helpers.js';

const PERSONAL_MATE_FEN = '6k1/5ppp/8/8/8/8/5PPP/R5K1 w - - 0 1';

async function dismissHomeGuide(page) {
  const guide = page.getByRole('region', { name: 'Guía rápida de Chess Studio' });
  if (await guide.isVisible().catch(() => false)) {
    await guide.getByRole('button', { name: 'Ahora no', exact: true }).click();
  }
}

test('Así juegas · Errores muestra reincidencias reales sin repetir el coaching de Ahora', async ({ page }) => {
  await mockApi(page);
  await login(page);
  await dismissHomeGuide(page);

  await page.evaluate(({ fen }) => {
    localStorage.setItem('chess-study-personal-puzzles', JSON.stringify([
      {
        id: 'fork-real-1',
        kind: 'personal',
        source: 'autopsy',
        title: 'Horquilla pendiente uno',
        description: 'Corrige la horquilla.',
        fen,
        solution: ['Ra8#'],
        incidentKeys: ['cpu:KNIGHT_FORK'],
        sourceGameId: 'game-fork-1',
        loss: 210,
        createdAt: '2026-08-29T10:00:00Z',
        attempts: 0,
        solves: 0,
        cleanSolves: 0,
      },
      {
        id: 'fork-real-2',
        kind: 'personal',
        source: 'autopsy',
        title: 'Horquilla pendiente dos',
        description: 'Corrige otra horquilla.',
        fen,
        solution: ['Ra8#'],
        incidentKeys: ['cpu:KNIGHT_FORK'],
        sourceGameId: 'game-fork-2',
        loss: 330,
        createdAt: '2026-08-30T10:00:00Z',
        attempts: 1,
        solves: 0,
        cleanSolves: 0,
      },
      {
        id: 'mate-singleton',
        kind: 'personal',
        source: 'autopsy',
        title: 'Mate aislado',
        description: 'Caso aislado.',
        fen,
        solution: ['Ra8#'],
        incidentKeys: ['human:MISSED_MATE'],
        sourceGameId: 'game-mate-1',
        loss: 500,
        createdAt: '2026-08-30T11:00:00Z',
        attempts: 0,
        solves: 0,
        cleanSolves: 0,
      },
    ]));
  }, { fen: PERSONAL_MATE_FEN });

  await buttonWithHeading(page, 'Así juegas').click();
  await expect(page.getByRole('heading', { name: 'Así juegas', exact: true })).toBeVisible();

  await page.getByRole('tab', { name: /Errores/ }).click();
  await expect(page.getByRole('heading', { name: 'No vuelvas a hacer esto', exact: true })).toBeVisible();
  await expect(page.getByText('Horquillas de caballo sufridas', { exact: true })).toBeVisible();
  await expect(page.getByText('2 posiciones reales · 2 partidas fuente · peor pérdida ~330 cp', { exact: true })).toBeVisible();
  await expect(page.getByText('Deuda activa · 0/2 casos limpios', { exact: true })).toBeVisible();
  await expect(page.locator('[data-training-debt="active"]')).toHaveCount(1);
  await expect(page.getByText('Mates que dejaste escapar', { exact: true })).toHaveCount(0);
  await expect(page.locator('.coaching-section')).toBeHidden();

  await page.getByRole('button', { name: 'Entrenar este patrón →', exact: true }).click();
  await expect(page.getByRole('heading', { name: /Horquilla pendiente (uno|dos)/ })).toBeVisible();
});

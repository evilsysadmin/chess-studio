import { expect, test } from '@playwright/test';
import { buttonWithHeading, login, mockApi } from './helpers.js';

const PERSONAL_MATE_FEN = '6k1/5ppp/8/8/8/8/5PPP/R5K1 w - - 0 1';

async function dismissHomeGuide(page) {
  const guide = page.getByRole('region', { name: 'Guía rápida de Chess Studio' });
  if (await guide.isVisible().catch(() => false)) {
    await guide.getByRole('button', { name: 'Ahora no', exact: true }).click();
  }
}

async function openErrors(page) {
  await buttonWithHeading(page, 'Así juegas').click();
  await expect(page.getByRole('heading', { name: 'Así juegas', exact: true })).toBeVisible();
  await page.getByRole('tab', { name: /Errores/ }).click();
  await expect(page.getByRole('heading', { name: 'No vuelvas a hacer esto', exact: true })).toBeVisible();
}

test('Así juegas · Errores reabre una deuda cuando aparece una reincidencia real nueva', async ({ page }) => {
  await mockApi(page);
  await login(page);
  await dismissHomeGuide(page);

  await page.evaluate(({ fen }) => {
    localStorage.setItem('chess-study-personal-puzzles', JSON.stringify([
      {
        id: 'fork-real-3', kind: 'personal', source: 'autopsy', title: 'Horquilla pendiente tres', description: 'Corrige la recaída reciente.',
        fen, solution: ['Ra8#'], incidentKeys: ['cpu:KNIGHT_FORK'], sourceGameId: 'game-fork-3', loss: 330,
        createdAt: '2026-08-30T10:00:00Z', attempts: 0, solves: 0, cleanSolves: 0,
      },
      {
        id: 'fork-real-2', kind: 'personal', source: 'autopsy', title: 'Horquilla limpia dos', description: 'Caso ya corregido.',
        fen, solution: ['Ra8#'], incidentKeys: ['cpu:KNIGHT_FORK'], sourceGameId: 'game-fork-2', loss: 260,
        createdAt: '2026-08-29T10:00:00Z', attempts: 1, solves: 1, cleanSolves: 1,
      },
      {
        id: 'fork-real-1', kind: 'personal', source: 'autopsy', title: 'Horquilla limpia uno', description: 'Caso antiguo ya corregido.',
        fen, solution: ['Ra8#'], incidentKeys: ['cpu:KNIGHT_FORK'], sourceGameId: 'game-fork-1', loss: 210,
        createdAt: '2026-08-28T10:00:00Z', attempts: 1, solves: 1, cleanSolves: 1,
      },
      {
        id: 'mate-singleton', kind: 'personal', source: 'autopsy', title: 'Mate aislado', description: 'Caso aislado.',
        fen, solution: ['Ra8#'], incidentKeys: ['human:MISSED_MATE'], sourceGameId: 'game-mate-1', loss: 500,
        createdAt: '2026-08-30T11:00:00Z', attempts: 0, solves: 0, cleanSolves: 0,
      },
    ]));
  }, { fen: PERSONAL_MATE_FEN });

  await openErrors(page);
  await expect(page.getByText('Horquillas de caballo sufridas', { exact: true })).toBeVisible();
  await expect(page.getByText('3 posiciones reales · 3 partidas fuente · peor pérdida ~330 cp', { exact: true })).toBeVisible();
  await expect(page.getByText('Deuda activa · últimos 2: 1/2 limpios', { exact: true })).toBeVisible();
  await expect(page.locator('[data-training-debt="active"]')).toHaveCount(1);
  await expect(page.getByText('Mates que dejaste escapar', { exact: true })).toHaveCount(0);
  await expect(page.locator('.coaching-section')).toBeHidden();

  await page.getByRole('button', { name: 'Entrenar este patrón →', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Horquilla pendiente tres', exact: true })).toBeVisible();
});

test('Así juegas · Matthias reconoce sólo una mejora de entrenamiento fechada', async ({ page }) => {
  await mockApi(page);
  await login(page);
  await dismissHomeGuide(page);

  await page.evaluate(({ fen }) => {
    const now = Date.now();
    localStorage.setItem('chess-study-personal-puzzles', JSON.stringify([
      {
        id: 'fork-clean-2', kind: 'personal', source: 'autopsy', title: 'Horquilla reciente dos', description: 'Caso limpio.',
        fen, solution: ['Ra8#'], incidentKeys: ['cpu:KNIGHT_FORK'], sourceGameId: 'game-clean-2', loss: 240,
        createdAt: new Date(now - 2 * 86_400_000).toISOString(), attempts: 1, solves: 1, cleanSolves: 1,
        lastCleanAt: new Date(now - 60_000).toISOString(),
      },
      {
        id: 'fork-clean-1', kind: 'personal', source: 'autopsy', title: 'Horquilla reciente uno', description: 'Caso limpio.',
        fen, solution: ['Ra8#'], incidentKeys: ['cpu:KNIGHT_FORK'], sourceGameId: 'game-clean-1', loss: 210,
        createdAt: new Date(now - 3 * 86_400_000).toISOString(), attempts: 1, solves: 1, cleanSolves: 1,
        lastCleanAt: new Date(now - 120_000).toISOString(),
      },
    ]));
  }, { fen: PERSONAL_MATE_FEN });

  await openErrors(page);
  await expect(page.getByText('Deuda pagada · últimos 2: 2/2 limpios', { exact: false })).toBeVisible();
  const improvement = page.getByLabel('Mejora reconocida por Matthias');
  await expect(improvement).toBeVisible();
  await expect(improvement).toContainText('Horquillas de caballo sufridas: los dos casos reales más recientes ya están limpios.');
  await expect(improvement).toContainText('Esto sí cuenta como mejora. No lo estropees.');
});

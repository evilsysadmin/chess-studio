import { expect, test } from '@playwright/test';
import { buttonWithHeading, login, mockApi } from './helpers.js';

const PERSONAL_MATE_FEN = '6k1/5ppp/8/8/8/8/5PPP/R5K1 w - - 0 1';

async function dismissHomeGuide(page) {
  const guide = page.getByRole('region', { name: 'Guía rápida de Chess Studio' });
  if (await guide.isVisible().catch(() => false)) {
    await guide.getByRole('button', { name: 'Ahora no', exact: true }).click();
  }
}

test('Así juegas · una recaída real posterior devuelve el patrón a la sesión automática', async ({ page }) => {
  await mockApi(page);
  await login(page);
  await dismissHomeGuide(page);

  await page.evaluate(({ fen }) => {
    localStorage.setItem('chess-study-personal-puzzles', JSON.stringify([
      {
        id: 'fork-trained-2',
        kind: 'personal',
        source: 'autopsy',
        title: 'Horquilla entrenada dos',
        description: 'Segundo caso ya entrenado.',
        fen,
        solution: ['Ra8#'],
        incidentKeys: ['cpu:KNIGHT_FORK'],
        sourceGameId: 'source-fork-2',
        loss: 260,
        createdAt: '2026-09-01T10:00:00Z',
        attempts: 1,
        solves: 1,
        cleanSolves: 1,
        lastCleanAt: '2026-09-01T12:00:00Z',
      },
      {
        id: 'fork-trained-1',
        kind: 'personal',
        source: 'autopsy',
        title: 'Horquilla entrenada uno',
        description: 'Primer caso ya entrenado.',
        fen,
        solution: ['Ra8#'],
        incidentKeys: ['cpu:KNIGHT_FORK'],
        sourceGameId: 'source-fork-1',
        loss: 210,
        createdAt: '2026-08-31T10:00:00Z',
        attempts: 1,
        solves: 1,
        cleanSolves: 1,
        lastCleanAt: '2026-08-31T12:00:00Z',
      },
    ]));

    localStorage.setItem('chess-study-clean-games-v1', JSON.stringify({
      relapseObservation: {
        version: 1,
        gameId: 'relapse-observation',
        date: '2026-09-02T12:00:00Z',
        sufficientSample: true,
        clean: false,
        incidentCoverageVersion: 1,
        incidentCoverageSufficient: true,
        incidentKeys: ['cpu:KNIGHT_FORK'],
      },
    }));
  }, { fen: PERSONAL_MATE_FEN });

  await buttonWithHeading(page, 'Así juegas').click();
  await expect(page.getByRole('heading', { name: 'Sesión automática', exact: true })).toBeVisible();

  await page.getByRole('button', { name: 'Tengo 5 min', exact: true }).click();
  const session = page.locator('.insights-guided-session.active');
  await expect(session.getByText('Sesión guiada · 5 min', { exact: true })).toBeVisible();
  await expect(session.getByText('Recaída detectada: Horquillas de caballo sufridas', { exact: true })).toBeVisible();
  await expect(session.getByText(/reapareció en 1 partida observada después del entrenamiento/)).toBeVisible();

  await session.getByRole('button', { name: 'Cancelar sesión', exact: true }).click();
  await page.getByRole('tab', { name: /Errores/ }).click();
  await expect(page.getByText('Horquillas de caballo sufridas', { exact: true })).toBeVisible();
  await expect(page.getByText('Sigue ocurriendo · reapareció después de entrenarlo y aún no hay muestra limpia suficiente.', { exact: true })).toBeVisible();
  await expect(page.locator('[data-improvement-state="still-occurring"]')).toHaveCount(1);
});

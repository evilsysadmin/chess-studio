import { expect, test } from '@playwright/test';
import { buttonWithHeading, login, mockApi } from './helpers.js';

const PERSONAL_MATE_FEN = '6k1/5ppp/8/8/8/8/5PPP/R5K1 w - - 0 1';

async function dismissHomeGuide(page) {
  const guide = page.getByRole('region', { name: 'Guía rápida de Chess Studio' });
  if (await guide.isVisible().catch(() => false)) {
    await guide.getByRole('button', { name: 'Ahora no', exact: true }).click();
  }
}

test('Así juegas · Errores reabre una deuda cuando aparece una reincidencia real nueva', async ({ page }) => {
  await mockApi(page);
  await login(page);
  await dismissHomeGuide(page);

  await page.evaluate(({ fen }) => {
    localStorage.setItem('chess-study-personal-puzzles', JSON.stringify([
      {
        id: 'fork-real-3',
        kind: 'personal',
        source: 'autopsy',
        title: 'Horquilla pendiente tres',
        description: 'Corrige la recaída reciente.',
        fen,
        solution: ['Ra8#'],
        incidentKeys: ['cpu:KNIGHT_FORK'],
        sourceGameId: 'game-fork-3',
        loss: 330,
        createdAt: '2026-08-30T10:00:00Z',
        attempts: 0,
        solves: 0,
        cleanSolves: 0,
      },
      {
        id: 'fork-real-2',
        kind: 'personal',
        source: 'autopsy',
        title: 'Horquilla limpia dos',
        description: 'Caso ya corregido.',
        fen,
        solution: ['Ra8#'],
        incidentKeys: ['cpu:KNIGHT_FORK'],
        sourceGameId: 'game-fork-2',
        loss: 260,
        createdAt: '2026-08-29T10:00:00Z',
        attempts: 1,
        solves: 1,
        cleanSolves: 1,
      },
      {
        id: 'fork-real-1',
        kind: 'personal',
        source: 'autopsy',
        title: 'Horquilla limpia uno',
        description: 'Caso antiguo ya corregido.',
        fen,
        solution: ['Ra8#'],
        incidentKeys: ['cpu:KNIGHT_FORK'],
        sourceGameId: 'game-fork-1',
        loss: 210,
        createdAt: '2026-08-28T10:00:00Z',
        attempts: 1,
        solves: 1,
        cleanSolves: 1,
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
  await expect(page.getByText('3 posiciones reales · 3 partidas fuente · peor pérdida ~330 cp', { exact: true })).toBeVisible();
  await expect(page.getByText('Deuda activa · últimos 2: 1/2 limpios', { exact: true })).toBeVisible();
  await expect(page.locator('[data-training-debt="active"]')).toHaveCount(1);
  await expect(page.getByText('Mates que dejaste escapar', { exact: true })).toHaveCount(0);
  await expect(page.locator('.coaching-section')).toBeHidden();

  await page.getByRole('button', { name: 'Entrenar este patrón →', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Horquilla pendiente tres', exact: true })).toBeVisible();
});

test('Así juegas · Errores muestra mejora probable sólo tras dos autopsias completas sin recurrencia', async ({ page }) => {
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
        description: 'Segundo caso entrenado.',
        fen,
        solution: ['Ra8#'],
        incidentKeys: ['cpu:KNIGHT_FORK'],
        sourceGameId: 'source-fork-2',
        loss: 260,
        createdAt: '2026-08-29T10:00:00Z',
        attempts: 1,
        solves: 1,
        cleanSolves: 1,
        lastCleanAt: '2026-08-29T12:00:00Z',
      },
      {
        id: 'fork-trained-1',
        kind: 'personal',
        source: 'autopsy',
        title: 'Horquilla entrenada uno',
        description: 'Primer caso entrenado.',
        fen,
        solution: ['Ra8#'],
        incidentKeys: ['cpu:KNIGHT_FORK'],
        sourceGameId: 'source-fork-1',
        loss: 210,
        createdAt: '2026-08-28T10:00:00Z',
        attempts: 1,
        solves: 1,
        cleanSolves: 1,
        lastCleanAt: '2026-08-28T12:00:00Z',
      },
    ]));

    localStorage.setItem('chess-study-clean-games-v1', JSON.stringify({
      observation1: {
        version: 1,
        gameId: 'observation-1',
        date: '2026-08-30T12:00:00Z',
        sufficientSample: true,
        clean: true,
        incidentCoverageVersion: 1,
        incidentCoverageSufficient: true,
        incidentKeys: [],
      },
      observation2: {
        version: 1,
        gameId: 'observation-2',
        date: '2026-08-31T12:00:00Z',
        sufficientSample: true,
        clean: true,
        incidentCoverageVersion: 1,
        incidentCoverageSufficient: true,
        incidentKeys: [],
      },
    }));
  }, { fen: PERSONAL_MATE_FEN });

  await buttonWithHeading(page, 'Así juegas').click();
  await page.getByRole('tab', { name: /Errores/ }).click();

  await expect(page.getByText('Horquillas de caballo sufridas', { exact: true })).toBeVisible();
  await expect(page.getByText('Mejora probable · varias autopsias completas recientes sin repetir este patrón.', { exact: true })).toBeVisible();
  await expect(page.getByText(/Deuda pagada/)).toHaveCount(0);
  await expect(page.locator('[data-improvement-state="probable-improvement"]')).toHaveCount(1);
  await expect(page.locator('[data-training-debt="paid"]')).toHaveCount(1);
});

test('Así juegas · sesión automática respeta 5/15/30 y sobrevive a refresh', async ({ page }) => {
  await mockApi(page);
  await login(page);
  await dismissHomeGuide(page);

  await page.evaluate(({ fen }) => {
    localStorage.setItem('chess-study-personal-puzzles', JSON.stringify([
      {
        id: 'guided-fork-2',
        kind: 'personal',
        source: 'autopsy',
        title: 'Horquilla pendiente dos',
        description: 'Segundo caso real para la sesión guiada.',
        fen,
        solution: ['Ra8#'],
        incidentKeys: ['cpu:KNIGHT_FORK'],
        sourceGameId: 'guided-source-2',
        loss: 260,
        createdAt: '2026-09-01T10:00:00Z',
        attempts: 0,
        solves: 0,
        cleanSolves: 0,
      },
      {
        id: 'guided-fork-1',
        kind: 'personal',
        source: 'autopsy',
        title: 'Horquilla pendiente uno',
        description: 'Primer caso real para la sesión guiada.',
        fen,
        solution: ['Ra8#'],
        incidentKeys: ['cpu:KNIGHT_FORK'],
        sourceGameId: 'guided-source-1',
        loss: 210,
        createdAt: '2026-08-31T10:00:00Z',
        attempts: 0,
        solves: 0,
        cleanSolves: 0,
      },
    ]));
  }, { fen: PERSONAL_MATE_FEN });

  await buttonWithHeading(page, 'Así juegas').click();
  await expect(page.getByRole('heading', { name: 'Sesión automática', exact: true })).toBeVisible();

  for (const minutes of [5, 15, 30]) {
    await page.getByRole('button', { name: `Tengo ${minutes} min`, exact: true }).click();
    let session = page.locator('.insights-guided-session.active');
    await expect(session.getByText(`Sesión guiada · ${minutes} min`, { exact: true })).toBeVisible();
    await expect(session.getByText(`${minutes} min`, { exact: true })).toBeVisible();
    await expect(session.getByText(/Ataca la deuda: Horquillas de caballo sufridas/)).toBeVisible();
    await expect(session.getByText(/posiciones reales en el expediente/)).toBeVisible();

    if (minutes === 5) {
      await page.reload();
      session = page.locator('.insights-guided-session.active');
      await expect(session.getByText('Sesión guiada · 5 min', { exact: true })).toBeVisible();
      await expect(session.getByText(/Ataca la deuda: Horquillas de caballo sufridas/)).toBeVisible();
    } else {
      await session.getByRole('button', { name: 'Ver recorrido completo', exact: true }).click();
      await expect(session.getByText('Partida corta de práctica', { exact: true })).toBeVisible();
    }

    await session.getByRole('button', { name: 'Cancelar sesión', exact: true }).click();
  }

  await expect(page.getByRole('heading', { name: 'Sesión automática', exact: true })).toBeVisible();
});

import { expect, test } from '@playwright/test';
import { buttonWithHeading, login, mockApi } from './helpers.js';

const PERSONAL_MATE_FEN = '6k1/5ppp/8/8/8/8/5PPP/R5K1 w - - 0 1';

async function dismissHomeGuide(page) {
  const guide = page.getByRole('region', { name: 'Guía rápida de Chess Studio' });
  if (await guide.isVisible().catch(() => false)) {
    await guide.getByRole('button', { name: 'Ahora no', exact: true }).click();
  }
}

async function seedPersonalTrainingEvidence(page) {
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
}

async function expectBudget(page, minutes) {
  await page.getByRole('button', { name: `Tengo ${minutes} min`, exact: true }).click();
  const session = page.locator('.insights-guided-session.active');
  await expect(session.getByText(`Sesión guiada · ${minutes} min`, { exact: true })).toBeVisible();
  await expect(session.getByText(`${minutes} min`, { exact: true })).toBeVisible();
  await expect(session.getByText(/Ataca la deuda: Horquillas de caballo sufridas/)).toBeVisible();
  await expect(session.getByText(/posiciones reales en el expediente/)).toBeVisible();
  return session;
}

test('Así juegas · sesión automática respeta 5/15/30 y sobrevive a refresh', async ({ page }) => {
  await mockApi(page);
  await login(page);
  await dismissHomeGuide(page);
  await seedPersonalTrainingEvidence(page);

  await buttonWithHeading(page, 'Así juegas').click();
  await expect(page.getByRole('heading', { name: 'Sesión automática', exact: true })).toBeVisible();

  let session = await expectBudget(page, 5);
  await page.reload();
  session = page.locator('.insights-guided-session.active');
  await expect(session.getByText('Sesión guiada · 5 min', { exact: true })).toBeVisible();
  await expect(session.getByText(/Ataca la deuda: Horquillas de caballo sufridas/)).toBeVisible();
  await session.getByRole('button', { name: 'Cancelar sesión', exact: true }).click();

  session = await expectBudget(page, 15);
  await expect(session.getByText('Partida corta de práctica', { exact: true })).toBeVisible();
  await session.getByRole('button', { name: 'Cancelar sesión', exact: true }).click();

  session = await expectBudget(page, 30);
  await expect(session.getByText('Partida corta de práctica', { exact: true })).toBeVisible();
  await session.getByRole('button', { name: 'Cancelar sesión', exact: true }).click();

  await expect(page.getByRole('heading', { name: 'Sesión automática', exact: true })).toBeVisible();
});

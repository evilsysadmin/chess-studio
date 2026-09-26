import { expect, test } from '@playwright/test';
import {
  buttonWithVisibleText,
  clickBoardMove,
  gameTurn,
  login,
  mockApi,
} from './helpers.js';

const PERSONAL_MATE_FEN = '6k1/5ppp/8/8/8/8/5PPP/R5K1 w - - 0 1';

async function dismissHomeGuide(page) {
  const guide = page.getByRole('region', { name: 'Guía rápida de Chess Studio' });
  if (!(await guide.isVisible().catch(() => false))) return;
  const dismiss = guide.getByRole('button', { name: 'Ahora no', exact: true });
  if (await dismiss.isVisible().catch(() => false)) await dismiss.click();
}

async function startQuickGame2D(page) {
  await buttonWithVisibleText(page, 'Partida rápida').click();
  const dialog = page.getByRole('dialog', { name: 'Configurar partida rápida' });
  await expect(dialog).toBeVisible();
  await dialog.locator('details.quick-match-settings > summary').click();
  const renderer = dialog.getByRole('group', { name: 'Tipo de tablero' });
  const twoD = renderer.getByRole('button', { name: '2D', exact: true });
  if (await twoD.getAttribute('aria-pressed') !== 'true') await twoD.click();
  await expect(twoD).toHaveAttribute('aria-pressed', 'true');
  await dialog.getByRole('button', { name: 'Empezar partida', exact: true }).click();
  await expect(page.getByRole('group', { name: /Tablero de ajedrez/ })).toBeVisible();
}

async function expectTouchTarget(locator) {
  await expect(locator).toBeVisible();
  const bounds = await locator.boundingBox();
  expect(bounds).not.toBeNull();
  expect(bounds.width).toBeGreaterThanOrEqual(44);
  expect(bounds.height).toBeGreaterThanOrEqual(44);
}

async function expectPersonalTrainingMobileContract(page, width) {
  await page.setViewportSize({ width, height: 844 });
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);

  const sourceButtons = page.getByRole('group', { name: 'Tipo de puzzle' }).getByRole('button');
  await expect(sourceButtons).toHaveCount(3);
  for (let index = 0; index < 3; index += 1) await expectTouchTarget(sourceButtons.nth(index));

  for (const target of [
    page.locator('.puzzle-screen > .back-link'),
    page.getByRole('button', { name: 'Entrenar esta deuda →', exact: true }),
    page.locator('.personal-puzzle-history > summary'),
    page.locator('.puzzle-progress-details > summary'),
    page.getByRole('button', { name: 'Ver solución', exact: true }),
    page.getByRole('button', { name: 'Siguiente puzzle', exact: true }),
  ]) {
    await expectTouchTarget(target);
  }
}

function recurringTrainingDebtProfileValue() {
  return JSON.stringify([
    {
      id: 'golden-fork-pending',
      kind: 'personal',
      source: 'autopsy',
      title: 'Horquilla pendiente golden path',
      description: 'Corrige una recaída real antes de volver a jugar.',
      fen: PERSONAL_MATE_FEN,
      solution: ['Ra8#'],
      incidentKeys: ['cpu:KNIGHT_FORK'],
      sourceGameId: 'golden-source-3',
      loss: 330,
      createdAt: '2026-09-12T10:00:00Z',
      attempts: 0,
      solves: 0,
      cleanSolves: 0,
    },
    {
      id: 'golden-fork-clean-2',
      kind: 'personal',
      source: 'autopsy',
      title: 'Horquilla histórica dos',
      description: 'Caso real ya entrenado.',
      fen: PERSONAL_MATE_FEN,
      solution: ['Ra8#'],
      incidentKeys: ['cpu:KNIGHT_FORK'],
      sourceGameId: 'golden-source-2',
      loss: 260,
      createdAt: '2026-09-10T10:00:00Z',
      attempts: 1,
      solves: 1,
      cleanSolves: 1,
      masteredAt: '2026-09-10T10:05:00Z',
    },
    {
      id: 'golden-fork-clean-1',
      kind: 'personal',
      source: 'autopsy',
      title: 'Horquilla histórica uno',
      description: 'Caso real ya entrenado.',
      fen: PERSONAL_MATE_FEN,
      solution: ['Ra8#'],
      incidentKeys: ['cpu:KNIGHT_FORK'],
      sourceGameId: 'golden-source-1',
      loss: 210,
      createdAt: '2026-09-08T10:00:00Z',
      attempts: 1,
      solves: 1,
      cleanSolves: 1,
      masteredAt: '2026-09-08T10:05:00Z',
    },
  ]);
}

test('Home · el avatar residente de Matthias abre Así juegas · y cierra el loop jugar → entrenar → volver a jugar', async ({ page }) => {
  test.setTimeout(150_000);
  await page.addInitScript(() => { Math.random = () => 0; });
  await mockApi(page, {
    gameScenario: 'mate',
    profileSeed: {
      'chess-study-personal-puzzles': recurringTrainingDebtProfileValue(),
    },
  });
  await login(page);
  await dismissHomeGuide(page);

  await startQuickGame2D(page);
  await expect(gameTurn(page)).toBeVisible();
  await clickBoardMove(page, 'g6', 'g7');

  const endgame = page.getByRole('dialog').filter({
    has: page.getByRole('heading', { name: 'Jaque mate', exact: true }),
  });
  await expect(endgame).toBeVisible();
  await expect(endgame.getByText('¡Ganaste la partida!', { exact: true })).toBeVisible();
  await endgame.getByRole('button', { name: 'Ver siguiente objetivo', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Modos principales', exact: true })).toBeVisible();

  const corner = page.getByRole('complementary', { name: 'Rincón de Matthias' });
  await corner.getByRole('button', { name: 'Abrir Así juegas con Matthias', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Así juegas', exact: true })).toBeVisible();
  await page.getByRole('tab', { name: /Errores/ }).click();
  await expect(page.getByText('Horquillas de caballo sufridas', { exact: true })).toBeVisible();
  await expect(page.locator('[data-training-debt="active"]')).toHaveCount(1);

  await page.reload();
  await expect(page.getByRole('heading', { name: 'Así juegas', exact: true })).toBeVisible();
  await page.getByRole('tab', { name: /Errores/ }).click();
  await page.getByRole('button', { name: 'Entrenar este patrón →', exact: true }).click();

  await expect(page.getByRole('heading', { name: 'Horquilla pendiente golden path', exact: true })).toBeVisible();
  for (const width of [360, 390, 430]) await expectPersonalTrainingMobileContract(page, width);
  await page.setViewportSize({ width: 390, height: 844 });
  await clickBoardMove(page, 'a1', 'a8');
  await expect(page.getByText('¡Resuelto!', { exact: true })).toBeVisible();
  const returnToPlay = page.getByRole('button', { name: 'Volver a jugar', exact: true });
  await expectTouchTarget(returnToPlay);
  for (const viewport of [
    { width: 360, height: 800 },
    { width: 390, height: 844 },
    { width: 430, height: 932 },
  ]) {
    await page.setViewportSize(viewport);
    const returnBox = await returnToPlay.boundingBox();
    expect(returnBox).not.toBeNull();
    expect(returnBox.x).toBeGreaterThanOrEqual(-1);
    expect(returnBox.x + returnBox.width).toBeLessThanOrEqual(viewport.width + 1);
    expect(returnBox.y).toBeGreaterThanOrEqual(-1);
    expect(returnBox.y + returnBox.height).toBeLessThanOrEqual(viewport.height + 1);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
  }
  await page.setViewportSize({ width: 390, height: 844 });

  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('chess-study-personal-puzzles') || '[]'));
  const trained = saved.find((item) => item.id === 'golden-fork-pending');
  expect(trained?.attempts).toBeGreaterThanOrEqual(1);
  expect(trained?.solves).toBeGreaterThanOrEqual(1);
  expect(trained?.cleanSolves).toBeGreaterThanOrEqual(1);

  await returnToPlay.click();
  const quickMatch = page.getByRole('dialog', { name: 'Configurar partida rápida' });
  await expect(quickMatch).toBeVisible();
  await quickMatch.locator('details.quick-match-settings > summary').click();
  const renderer = quickMatch.getByRole('group', { name: 'Tipo de tablero' });
  const twoD = renderer.getByRole('button', { name: '2D', exact: true });
  if (await twoD.getAttribute('aria-pressed') !== 'true') await twoD.click();
  await quickMatch.getByRole('button', { name: 'Empezar partida', exact: true }).click();
  await expect(gameTurn(page)).toBeVisible();
});

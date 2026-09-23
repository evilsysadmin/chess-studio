import { expect, test } from '@playwright/test';
import { buttonWithHeading, login, mockApi } from './helpers.js';

const BASIC_LESSONS_BEFORE_EXAM = [
  'pawn-double-step',
  'pawn-capture',
  'rook-lines',
  'bishop-diagonal',
  'knight-jump',
  'queen-power',
  'king-step',
  'castle-short',
];



test('Escuela de Matthias · la lección manda y el plan de estudios queda bajo demanda', async ({ page }) => {
  await mockApi(page);
  await login(page);

  await buttonWithHeading(page, 'Escuela de Matthias').click();
  const shell = page.locator('.matthias-school-shell');
  const plan = page.getByRole('button', { name: 'Plan de estudios', exact: true });

  await expect(shell).toHaveAttribute('data-school-curriculum', 'closed');
  await expect(shell.locator('.matthias-school-course-strip')).toBeHidden();
  await expect(shell.locator('.matthias-school-lessons')).toBeHidden();

  await plan.click();
  await expect(shell).toHaveAttribute('data-school-curriculum', 'open');
  await expect(shell.locator('.matthias-school-course-strip')).toBeVisible();
  await expect(shell.locator('.matthias-school-lessons')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Cerrar plan de estudios', exact: true })).toBeVisible();
});


test('Escuela de Matthias · modo tablero ocupa el viewport y Escape sólo lo contrae', async ({ page }) => {
  await mockApi(page);
  await login(page);

  await buttonWithHeading(page, 'Escuela de Matthias').click();
  const shell = page.locator('.matthias-school-shell');
  await page.getByRole('button', { name: 'Expandir tablero', exact: true }).click();

  await expect(shell).toHaveAttribute('data-school-focus', 'board');
  await expect(page.getByRole('button', { name: 'Salir del modo tablero', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'El peón avanza', exact: true })).toBeVisible();

  const desktopBoardRatio = await page.locator('.matthias-school-board').evaluate((node) => (
    node.getBoundingClientRect().width / window.innerWidth
  ));
  expect(desktopBoardRatio).toBeGreaterThan(0.55);

  for (const width of [360, 390, 430]) {
    await page.setViewportSize({ width, height: 844 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
    await expect(page.locator('.matthias-school-board')).toBeVisible();
  }

  await page.keyboard.press('Escape');
  await expect(shell).toHaveAttribute('data-school-focus', 'normal');
  await expect(page.getByRole('heading', { name: 'El peón avanza', exact: true })).toBeVisible();
  await expect(page.locator('.illustrated-home')).toHaveCount(0);
});

test('Escuela de Matthias · Matthias guía sobre el tablero y la pista no es sólo texto', async ({ page }) => {
  await mockApi(page);
  await login(page);

  await buttonWithHeading(page, 'Escuela de Matthias').click();
  const board = page.locator('.matthias-school-board');
  const origin = board.getByRole('button', { name: /^Casilla e2, peón blanco/ });
  const target = board.getByRole('button', { name: /^Casilla e4, vacía/ });

  await expect(origin).toHaveClass(/hint-move/);
  await expect(origin).toHaveClass(/classroom-focus/);
  await expect(target).not.toHaveClass(/hint-move/);

  const wrong = board.getByRole('button', { name: /^Casilla a3, vacía/ });
  await wrong.click();
  await expect(wrong).toHaveClass(/classroom-danger/);

  await page.getByRole('button', { name: 'Dame una pista', exact: true }).click();
  await expect(wrong).not.toHaveClass(/classroom-danger/);
  await expect(target).toHaveClass(/hint-move/);
  await expect(page.getByRole('status')).toContainText('Te lo marco en el tablero');

  await origin.click();
  await expect(target).toHaveClass(/legal-move/);
});

test('Escuela de Matthias · una lección dominada se puede repetir de verdad', async ({ page }) => {
  await mockApi(page);
  await login(page);

  await buttonWithHeading(page, 'Escuela de Matthias').click();
  await expect(page.getByRole('heading', { name: 'El peón avanza', exact: true })).toBeVisible();

  const schoolBoard = page.locator('.matthias-school-board');
  const completeLesson = async () => {
    await page.getByRole('button', { name: /^Casilla e2, peón blanco/ }).click();
    await page.getByRole('button', { name: /^Casilla e4, vacía/ }).click();
    await expect(schoolBoard).toHaveAttribute('data-school-playback', 'moving');
    await expect(page.getByText(/Dos casillas y ningún tratado internacional roto/)).toBeVisible();
    await expect(schoolBoard).toHaveAttribute('data-school-playback', 'idle');
  };

  await completeLesson();
  const repeat = page.getByRole('button', { name: 'Repetir', exact: true });
  await expect(repeat).toBeVisible();
  await repeat.click();

  await expect(page.getByRole('button', { name: /^Casilla e2, peón blanco/ })).toBeVisible();
  await completeLesson();
});

test('Escuela de Matthias · suspender un examen reinicia un intento real y permite aprobarlo', async ({ page }) => {
  const schoolProgress = Object.fromEntries(BASIC_LESSONS_BEFORE_EXAM.map((id) => [
    id,
    { completed: true, attempts: 1, completedAt: '2026-08-31T12:00:00.000Z' },
  ]));
  await mockApi(page, {
    profileSeed: {
      'chess-study-matthias-school-v1': JSON.stringify(schoolProgress),
    },
  });
  await login(page);

  await buttonWithHeading(page, 'Escuela de Matthias').click();
  await expect(page.getByRole('heading', { name: 'Examen básico · mate en una', exact: true })).toBeVisible();

  const schoolBoard = page.locator('.matthias-school-board');
  await expect(schoolBoard).toHaveAttribute('data-school-attempt', '0');
  await expect(schoolBoard).toHaveAttribute('data-school-renderer', '2d');

  const wrongSquare = page.getByRole('button', { name: /^Casilla a1, vacía/ });
  await wrongSquare.click();
  await wrongSquare.click();
  await wrongSquare.click();

  const retry = page.getByRole('button', { name: 'Reintentar examen', exact: true });
  const status = page.getByRole('status');
  await expect(retry).toBeVisible();
  await expect(status).toContainText('Suspendido');
  await retry.click();

  await expect(schoolBoard).toHaveAttribute('data-school-attempt', '1');
  await expect(retry).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Reiniciar', exact: true })).toBeVisible();
  await expect(page.getByText('Errores 0/2', { exact: true })).toBeVisible();
  await expect(status).toContainText('Examen reiniciado');
  await expect(status).toContainText('posición inicial restaurada');

  await page.getByRole('button', { name: /^Casilla f7, dama blanca/ }).click();
  await page.getByRole('button', { name: /^Casilla g7, vacía/ }).click();

  await expect(page.getByText(/Aprobado\. Ya sabes mover las piezas/)).toBeVisible();
  await expect(page.getByText('✓ aprobado', { exact: true })).toBeVisible();
});

test('Escuela de Matthias · el primer movimiento se aprende hands-on y persiste tras F5 · layout móvil', async ({ page }) => {
  await page.setViewportSize({ width: 430, height: 844 });
  await mockApi(page);
  await login(page);

  await buttonWithHeading(page, 'Escuela de Matthias').click();
  const lessonHeading = page.getByRole('heading', { name: 'El peón avanza', exact: true });
  await expect(lessonHeading).toBeVisible();
  await expect(page.getByRole('button', { name: /^Casilla e2, peón blanco/ })).toBeVisible();

  for (const width of [360, 390, 430]) {
    await page.setViewportSize({ width, height: 844 });
    await expect(lessonHeading).toBeVisible();
    await expect(page.getByRole('button', { name: /^Casilla e2, peón blanco/ })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
  }
});

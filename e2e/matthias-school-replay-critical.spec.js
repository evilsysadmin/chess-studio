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

test('Escuela de Matthias · una lección dominada se puede repetir de verdad', async ({ page }) => {
  await mockApi(page);
  await login(page);

  await buttonWithHeading(page, 'Escuela de Matthias').click();
  await expect(page.getByRole('heading', { name: 'El peón avanza', exact: true })).toBeVisible();

  const completeLesson = async () => {
    await page.getByRole('button', { name: /^Casilla e2, peón blanco/ }).click();
    await page.getByRole('button', { name: /^Casilla e4, vacía/ }).click();
    await expect(page.getByText(/Dos casillas y ningún tratado internacional roto/)).toBeVisible();
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

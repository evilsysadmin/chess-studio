import { expect, test } from '@playwright/test';
import { buttonWithHeading, login, mockApi } from './helpers.js';

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

import { expect, test } from '@playwright/test';
import { buttonWithHeading, login, mockApi } from './helpers.js';

test('Escuela · el cuaderno de Matthias conserva contexto y se puede compactar', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await mockApi(page);
  await login(page);
  await buttonWithHeading(page, 'Escuela de Matthias').click();

  const shell = page.locator('.matthias-school-shell');
  const coach = shell.locator('.matthias-school-coach');
  const detail = coach.locator('#matthias-school-coach-detail');
  await expect(shell).toHaveAttribute('data-school-coach', 'expanded');
  await expect(detail).toBeVisible();
  await expect(coach.getByRole('button', { name: 'Compactar' })).toHaveAttribute('aria-expanded', 'true');
  await testInfo.attach('school-coach-expanded-desktop', { body: await page.screenshot(), contentType: 'image/png' });

  await page.locator('.matthias-school-board').getByRole('button', { name: /^Casilla a3, vacía/ }).click();
  await expect(coach.getByRole('status')).toContainText(/casilla/i);
  await page.getByRole('button', { name: 'Dame una pista', exact: true }).click();
  await expect(coach.getByRole('status')).toContainText('Se lo marco en el tablero');
  await expect(coach.locator('.matthias-school-coach-history')).toContainText(/casilla/i);

  await coach.getByRole('button', { name: 'Compactar' }).click();
  await expect(shell).toHaveAttribute('data-school-coach', 'compact');
  await expect(detail).toBeHidden();
  await expect(coach.getByRole('status')).toContainText('Se lo marco en el tablero');
  await coach.getByRole('button', { name: 'Ampliar' }).click();
  await expect(detail).toBeVisible();
  await expect(coach.locator('.matthias-school-coach-history')).toContainText(/casilla/i);
});

test('Escuela · móvil empieza compacto y puede consultar el historial sin desbordar', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await mockApi(page);
  await login(page);
  await buttonWithHeading(page, 'Escuela de Matthias').click();

  const shell = page.locator('.matthias-school-shell');
  const coach = shell.locator('.matthias-school-coach');
  await expect(shell).toHaveAttribute('data-school-coach', 'compact');
  await coach.getByRole('button', { name: 'Ampliar' }).click();
  await expect(shell).toHaveAttribute('data-school-coach', 'expanded');
  await expect(coach.locator('#matthias-school-coach-detail')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  await testInfo.attach('school-coach-expanded-mobile', { body: await page.screenshot(), contentType: 'image/png' });
  await coach.getByRole('button', { name: 'Compactar' }).click();
  await expect(coach.locator('#matthias-school-coach-detail')).toBeHidden();
});
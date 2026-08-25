import { expect, test } from '@playwright/test';
import { login, mockApi } from './helpers.js';

test('storage bloqueado · login y navegación básica siguen utilizables', async ({ page }) => {
  await page.addInitScript(() => {
    const originalSet = Storage.prototype.setItem;
    Storage.prototype.setItem = function patchedSetItem(key, value) {
      if (String(key).startsWith('chess-study-')) {
        const error = new DOMException('Storage blocked by compatibility test', 'SecurityError');
        throw error;
      }
      return originalSet.call(this, key, value);
    };
  });
  await mockApi(page);
  await login(page);
  await expect(page.getByRole('region', { name: 'Hoy en Chess Studio' })).toBeVisible();
  await expect(page.getByRole('button', { name: /Abrir desafíos|Ver desafíos/ })).toBeVisible();
});

test('desafíos diarios · sección propia no desborda en móvil', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await mockApi(page);
  await login(page);
  await page.getByRole('button', { name: /Abrir desafíos|Ver desafíos/ }).click();
  await expect(page.getByRole('heading', { name: 'Desafíos diarios', exact: true })).toBeVisible();
  await expect(page.getByText('0/3', { exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
});

import { expect, test } from '@playwright/test';
import { buttonWithVisibleText, login, mockApi } from './helpers.js';

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

for (const width of [360, 390, 430]) {
  test(`Home · jerarquía principal usable y sin desbordar a ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    await mockApi(page);
    await login(page);

    await expect(page.getByRole('heading', { name: '¿Qué te apetece?', exact: true })).toBeVisible();
    await expect(buttonWithVisibleText(page, 'Partida rápida')).toBeVisible();
    await expect(page.getByText('Más modos de juego', { exact: true })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
  });
}

test('Home · la guía inicial no bloquea, recuerda el cierre y puede reabrirse', async ({ page }) => {
  await mockApi(page);
  await login(page);

  const guide = page.getByRole('region', { name: 'Guía rápida de Chess Studio' });
  await expect(guide).toBeVisible();
  await guide.getByRole('button', { name: 'Explorar Home', exact: true }).click();
  await expect(guide).toHaveCount(0);

  await page.reload();
  await expect(guide).toHaveCount(0);
  await page.getByRole('button', { name: 'Guía rápida', exact: true }).click();
  await expect(guide).toBeVisible();
  await expect(buttonWithVisibleText(page, 'Partida rápida')).toBeVisible();
});

test('Partida · PGN permanece oculto dentro de opciones avanzadas', async ({ page }) => {
  await mockApi(page);
  await login(page);
  await buttonWithVisibleText(page, 'Partida rápida').click();
  await page.getByRole('button', { name: 'Empezar partida', exact: true }).click();

  await expect(page.getByText('Tu turno', { exact: true })).toBeVisible();
  await expect(page.getByText('Opciones avanzadas', { exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Exportar archivo .pgn', exact: true })).toHaveCount(0);
});

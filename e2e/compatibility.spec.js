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

test('Home · cuenta y cierre de sesión son acciones accesibles', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await mockApi(page);
  await login(page);

  await page.getByRole('button', { name: 'Abrir menú de cuenta', exact: true }).click();
  await expect(page.getByRole('menuitem', { name: /Mi cuenta/ })).toBeVisible();
  await expect(page.getByRole('menuitem', { name: /Ajustes/ })).toBeVisible();
  await expect(page.getByRole('menuitem', { name: /Cerrar sesión/ })).toBeVisible();
  await page.getByRole('region', { name: 'Guía rápida de Chess Studio' }).getByRole('button', { name: 'Explorar Home', exact: true }).click();
  await page.getByRole('button', { name: 'Abrir asistente de feedback' }).click();
  const assistant = page.getByRole('complementary', { name: 'Asistente de feedback' });
  await expect(assistant).toBeVisible();
  await assistant.getByRole('button', { name: 'Dar feedback', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Dinos qué mejorar' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
});

test('Home · Combat abre un resumen compacto del ejército', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await mockApi(page);
  await login(page);
  await page.getByRole('button', { name: /Combat.*XP/i }).click();
  const summary = page.getByRole('dialog', { name: 'Tu ejército' });
  await expect(summary).toBeVisible();
  await expect(summary.getByText('XP disponible', { exact: true })).toBeVisible();
  await expect(summary.getByText('veteranos', { exact: true })).toBeVisible();
  await expect(summary.getByRole('button', { name: 'Ver ejército', exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
});

test('Registro · permite elegir inglés y localiza el acceso', async ({ page }) => {
  await mockApi(page);
  await page.goto('/');
  await page.getByRole('button', { name: '¿No tienes cuenta? Créala', exact: true }).click();
  await page.getByLabel('Idioma', { exact: true }).selectOption('en');
  await expect(page.getByRole('heading', { name: 'Create account', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Create account', exact: true })).toBeVisible();
});

test('Partida · PGN permanece oculto dentro de opciones avanzadas', async ({ page }) => {
  await mockApi(page);
  await login(page);
  await buttonWithVisibleText(page, 'Partida rápida').click();
  await page.getByRole('button', { name: 'Empezar partida', exact: true }).click();

  await expect(page.getByText('Tu turno', { exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Chess Studio', exact: true })).toHaveCount(0);
  await expect(page.locator('.player-status-bar')).toHaveCount(0);
  await expect(page.locator('.square-coordinate')).toHaveCount(16);
  await expect(page.locator('.rank-labels, .file-labels')).toHaveCount(0);
  await expect(page.getByText('Opciones avanzadas', { exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Exportar archivo .pgn', exact: true })).toHaveCount(0);
});

test('Laboratorio · FEN sólo aparece dentro de opciones avanzadas', async ({ page }) => {
  await mockApi(page);
  await login(page);
  await page.getByText('Más modos de juego', { exact: true }).click();
  await buttonWithVisibleText(page, 'Laboratorio').click();

  await expect(page.getByRole('heading', { name: 'Prepara una posición y juega', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: /FEN/ })).toHaveCount(0);
  await page.getByText('Opciones avanzadas de la posición', { exact: true }).click();
  await expect(page.getByRole('button', { name: 'Importar posición en formato FEN', exact: true })).toBeVisible();
});

import { expect, test } from '@playwright/test';
import { buttonWithVisibleText, gameTurn, login, mockApi } from './helpers.js';

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
  await expect(page.getByText('0/4', { exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
});

for (const width of [360, 390, 430]) {
  test(`Home · jerarquía principal usable y sin desbordar a ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    await mockApi(page);
    await login(page);

    await expect(page.getByRole('region', { name: 'Modos principales', exact: true })).toBeVisible();
    await expect(buttonWithVisibleText(page, 'Partida rápida')).toBeVisible();
    await expect(page.getByText('Más modos de juego', { exact: true })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
  });

  test(`Mi progreso · diagnóstico visible y sin desbordar a ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    await mockApi(page);
    await login(page);
    await page.getByRole('button', { name: 'Abrir menú de cuenta', exact: true }).click();
    await page.getByRole('menuitem', { name: /Mi progreso/ }).click();
    await expect(page.getByRole('tab', { name: /Diagnóstico/ })).toHaveAttribute('aria-selected', 'true');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
  });

  test(`Home → Mi progreso · abre la carrera y sus secciones caben a ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    await mockApi(page);
    await login(page);
    const guide = page.getByRole('region', { name: 'Guía rápida de Chess Studio' });
    await guide.getByRole('button', { name: 'Ahora no', exact: true }).click();
    await page.getByRole('button', { name: 'Ver mi progreso →', exact: true }).click();

    await expect(page.getByRole('heading', { name: 'Mi progreso', exact: true })).toBeVisible();
    await expect(page.getByRole('tab', { name: /Mi progreso.*Evolución e historial/ })).toHaveAttribute('aria-selected', 'true');
    const sections = page.getByRole('navigation', { name: 'Secciones de Mi progreso' });
    await expect(sections).toBeVisible();
    expect(await sections.evaluate((node) => node.scrollWidth <= node.clientWidth + 1)).toBe(true);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
  });

  test(`War Room · viewport y controles táctiles caben a ${width}px`, async ({ page }) => {
    test.setTimeout(60_000);
    await page.setViewportSize({ width, height: 844 });
    await mockApi(page);
    await login(page);
    await buttonWithVisibleText(page, 'Partida rápida').click();
    await page.getByRole('button', { name: 'Empezar partida', exact: true }).click();
    await expect(gameTurn(page)).toBeVisible();

    await page.getByRole('button', { name: 'Cambiar apariencia y piezas del tablero', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Ajustes' });
    await dialog.getByRole('radio', { name: /3D$/ }).click();
    await dialog.getByRole('button', { name: 'Cerrar', exact: true }).click();

    const board = page.locator('[data-board3d-war-room="true"]');
    const canvas = page.locator('.board3d-main-canvas');
    const focus = page.getByRole('button', { name: 'Focus', exact: true });
    const abandon = page.getByRole('button', { name: 'Abandonar partida', exact: true });
    const appearance = page.locator('.board3d-customize');
    await expect(board).toBeVisible({ timeout: 30_000 });
    await expect(canvas).toBeVisible({ timeout: 30_000 });
    await expect(focus).toBeVisible();
    await expect(abandon).toBeVisible();
    await expect(appearance).toBeVisible();

    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
    const boardRect = await board.boundingBox();
    expect(boardRect).not.toBeNull();
    expect(boardRect.x).toBeGreaterThanOrEqual(-1);
    expect(boardRect.x + boardRect.width).toBeLessThanOrEqual(width + 1);

    for (const control of [focus, abandon, appearance]) {
      const rect = await control.boundingBox();
      expect(rect).not.toBeNull();
      expect(rect.width).toBeGreaterThanOrEqual(40);
      expect(rect.height).toBeGreaterThanOrEqual(40);
    }

    await focus.click();
    await expect(page.locator('.game-layout')).toHaveAttribute('data-mobile-focus', 'true');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
    const exit = page.getByRole('button', { name: 'Salir del modo Focus', exact: true });
    await expect(exit).toBeVisible();
    const exitRect = await exit.boundingBox();
    expect(exitRect).not.toBeNull();
    expect(exitRect.width).toBeGreaterThanOrEqual(40);
    expect(exitRect.height).toBeGreaterThanOrEqual(40);
    await exit.click();
    await expect(page.locator('.game-layout')).toHaveAttribute('data-mobile-focus', 'false');
  });
}

test('Home · la guía inicial no bloquea, recuerda el cierre y puede reabrirse', async ({ page }) => {
  await mockApi(page);
  await login(page);

  const guide = page.getByRole('region', { name: 'Guía rápida de Chess Studio' });
  await expect(guide).toBeVisible();
  await guide.getByRole('button', { name: 'Ahora no', exact: true }).click();
  await expect(guide).toHaveCount(0);

  await page.reload();
  await expect(guide).toHaveCount(0);
  await page.getByRole('button', { name: /Retomar guía/ }).click();
  await expect(guide).toBeVisible();
  await expect(guide.getByRole('button', { name: /^Entra en la Escuela de Matthias\./ })).toBeVisible();
});

test('Home · cuenta y cierre de sesión son acciones accesibles', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await mockApi(page);
  await login(page);

  await page.getByRole('button', { name: 'Abrir menú de cuenta', exact: true }).click();
  await expect(page.getByRole('menuitem', { name: /Mi cuenta/ })).toBeVisible();
  await expect(page.getByRole('menuitem', { name: /Personalizar/ })).toBeVisible();
  await expect(page.getByRole('menuitem', { name: /Cerrar sesión/ })).toBeVisible();
  await page.getByRole('region', { name: 'Guía rápida de Chess Studio' }).getByRole('button', { name: 'Ahora no', exact: true }).click();
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
  await page.getByRole('button', { name: /Estado de Combat: rango/i }).click();
  const summary = page.getByRole('dialog', { name: 'Tu ejército' });
  await expect(summary).toBeVisible();
  await expect(summary.getByText('Créditos disponibles', { exact: true })).toBeVisible();
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

test('Partida · la mesa principal no expone PGN ni una franja avanzada', async ({ page }) => {
  await mockApi(page);
  await login(page);
  await buttonWithVisibleText(page, 'Partida rápida').click();
  await page.getByRole('button', { name: 'Empezar partida', exact: true }).click();

  await expect(gameTurn(page)).toBeVisible();
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

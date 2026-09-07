import { expect, test } from '@playwright/test';
import { login, mockApi } from './helpers.js';

async function dismissHomeGuide(page) {
  const guide = page.getByRole('region', { name: 'Guía rápida de Chess Studio' });
  if (await guide.isVisible().catch(() => false)) {
    await guide.getByRole('button', { name: 'Ahora no', exact: true }).click();
  }
}

async function openHome(page) {
  await mockApi(page);
  await login(page);
  await dismissHomeGuide(page);
  await expect(page.getByRole('region', { name: 'Modos principales', exact: true })).toBeVisible();
}

async function homeDensitySnapshot(page) {
  return page.evaluate(() => {
    const menu = document.querySelector('.menu.home-friendly');
    const castle = menu?.querySelector(':scope > .home-castle-life');
    const primary = menu?.querySelector(':scope > .home-continue-group, :scope > .home-next-action');
    const modes = menu?.querySelector(':scope > .home-modes-section');
    const quick = modes?.querySelector('.home-mode-quick');
    const today = menu?.querySelector(':scope > .home-today-card');
    const learning = menu?.querySelector(':scope > .home-primary-group:not(.home-modes-section)');
    const modeHeading = modes?.querySelector('.home-group-heading h2');
    const learningHeading = learning?.querySelector('.home-group-heading h2');
    const rect = (node) => {
      if (!node) return null;
      const box = node.getBoundingClientRect();
      return {
        top: box.top,
        right: box.right,
        bottom: box.bottom,
        left: box.left,
        width: box.width,
        height: box.height,
      };
    };
    const menuStyle = menu ? getComputedStyle(menu) : null;

    return {
      density: menuStyle?.getPropertyValue('--home-density-mode').trim() || '',
      castle: rect(castle),
      primary: rect(primary),
      modes: rect(modes),
      quick: rect(quick),
      today: rect(today),
      learning: rect(learning),
      modeHeading: modeHeading ? getComputedStyle(modeHeading, '::after').content : '',
      learningHeading: learningHeading ? getComputedStyle(learningHeading, '::after').content : '',
      viewportHeight: window.innerHeight,
      horizontalOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    };
  });
}

test('Home desktop · adapta densidad al alto real de viewport sin perder la ruta rápida', async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 768 });
  await openHome(page);

  const cases = [
    { viewport: { width: 1366, height: 768 }, density: 'compact' },
    { viewport: { width: 1536, height: 864 }, density: 'standard' },
    { viewport: { width: 1920, height: 1080 }, density: 'spacious' },
    { viewport: { width: 2560, height: 1440 }, density: 'spacious' },
  ];

  let previousCastleHeight = 0;
  for (const entry of cases) {
    await page.setViewportSize(entry.viewport);
    const snapshot = await homeDensitySnapshot(page);

    expect(snapshot.density).toBe(entry.density);
    expect(snapshot.castle).not.toBeNull();
    expect(snapshot.primary).not.toBeNull();
    expect(snapshot.quick).not.toBeNull();
    expect(snapshot.horizontalOverflow).toBeLessThanOrEqual(1);
    expect(snapshot.primary.top).toBeGreaterThanOrEqual(snapshot.castle.bottom - 1);
    expect(snapshot.quick.bottom).toBeLessThanOrEqual(snapshot.viewportHeight);
    expect(snapshot.castle.height).toBeGreaterThanOrEqual(previousCastleHeight);
    expect(snapshot.modeHeading).toContain('Explorar otras rutas');
    expect(snapshot.learningHeading).toContain('Sigue aprendiendo');

    previousCastleHeight = snapshot.castle.height;
  }
});

test('Home 1080p · muestra el recorrido principal completo sin convertirlo en una pared de tarjetas', async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await openHome(page);

  const snapshot = await homeDensitySnapshot(page);
  expect(snapshot.density).toBe('spacious');
  expect(snapshot.today).not.toBeNull();
  expect(snapshot.learning).not.toBeNull();
  expect(snapshot.today.bottom).toBeLessThanOrEqual(snapshot.viewportHeight);
  expect(snapshot.learning.top).toBeLessThan(snapshot.viewportHeight);

  const cards = await page.evaluate(() => ({
    routeHeight: document.querySelector('.home-modes-section .home-mode-card')?.getBoundingClientRect().height || 0,
    learningHeight: document.querySelector('.home-primary-group:not(.home-modes-section) .home-learning-card')?.getBoundingClientRect().height || 0,
    dailyHeight: document.querySelector('.home-today-card')?.getBoundingClientRect().height || 0,
  }));

  expect(cards.routeHeight).toBeLessThanOrEqual(110);
  expect(cards.learningHeight).toBeLessThanOrEqual(106);
  expect(cards.dailyHeight).toBeLessThanOrEqual(84);
});

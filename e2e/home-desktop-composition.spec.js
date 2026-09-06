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

async function composition(page) {
  return page.evaluate(() => {
    const castle = document.querySelector('.menu.home-friendly > .home-castle-life');
    const primary = document.querySelector('.menu.home-friendly > .home-continue-group, .menu.home-friendly > .home-next-action');
    const quick = document.querySelector('.home-modes-section .home-mode-quick h3');
    const castleRect = castle?.getBoundingClientRect();
    const primaryRect = primary?.getBoundingClientRect();
    const quickRect = quick?.getBoundingClientRect();
    return {
      castle: castleRect ? {
        top: castleRect.top,
        bottom: castleRect.bottom,
        width: castleRect.width,
        height: castleRect.height,
      } : null,
      primary: primaryRect ? {
        top: primaryRect.top,
        bottom: primaryRect.bottom,
      } : null,
      quick: quickRect ? {
        top: quickRect.top,
        bottom: quickRect.bottom,
      } : null,
      viewportHeight: window.innerHeight,
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    };
  });
}

test('Home desktop corto · el castillo conserva presencia y deja de ser una tira ultrapanorámica', async ({ page }) => {
  await page.setViewportSize({ width: 1814, height: 772 });
  await openHome(page);

  const view = await composition(page);
  expect(view.castle).not.toBeNull();
  expect(view.primary).not.toBeNull();
  expect(view.quick).not.toBeNull();
  expect(view.castle.height).toBeGreaterThanOrEqual(335);
  expect(view.castle.width / view.castle.height).toBeLessThan(5.6);
  expect(view.primary.top).toBeLessThan(view.castle.bottom);
  expect(view.primary.bottom).toBeGreaterThan(view.castle.bottom);
  expect(view.quick.bottom).toBeLessThanOrEqual(view.viewportHeight);
  expect(view.overflow).toBeLessThanOrEqual(1);
});

test('Home 1920×1080 · el Great Hall sigue siendo el hero visual', async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await openHome(page);

  const view = await composition(page);
  expect(view.castle).not.toBeNull();
  expect(view.castle.height).toBeGreaterThanOrEqual(450);
  expect(view.castle.height).toBeLessThanOrEqual(565);
  expect(view.castle.width / view.castle.height).toBeLessThan(4.6);
  expect(view.overflow).toBeLessThanOrEqual(1);
});

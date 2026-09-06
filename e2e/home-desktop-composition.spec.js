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
  await expect(page.locator('.home-castle-hub__scene canvas')).toBeVisible();
}

async function composition(page) {
  return page.evaluate(() => {
    const castle = document.querySelector('.menu.home-friendly > .home-castle-life');
    const primary = document.querySelector('.menu.home-friendly > .home-continue-group, .menu.home-friendly > .home-next-action');
    const modesGrid = document.querySelector('.home-modes-section > .home-primary-grid');
    const play = document.querySelector('.home-castle-hub__room--play');
    const dungeon = document.querySelector('.home-more-modes > summary');
    const scene = document.querySelector('.home-castle-hub__scene');
    const castleRect = castle?.getBoundingClientRect();
    const playRect = play?.getBoundingClientRect();
    const dungeonRect = dungeon?.getBoundingClientRect();
    return {
      castle: castleRect ? { top: castleRect.top, bottom: castleRect.bottom, width: castleRect.width, height: castleRect.height } : null,
      play: playRect ? { top: playRect.top, bottom: playRect.bottom, width: playRect.width, height: playRect.height } : null,
      dungeon: dungeonRect ? { top: dungeonRect.top, bottom: dungeonRect.bottom, width: dungeonRect.width, height: dungeonRect.height } : null,
      primaryDisplay: primary ? getComputedStyle(primary).display : '',
      modesGridDisplay: modesGrid ? getComputedStyle(modesGrid).display : '',
      camera: scene?.dataset.homeCastleHubCamera || '',
      dungeonScene: scene?.dataset.homeCastleHubDungeonStair || '',
      viewportHeight: window.innerHeight,
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    };
  });
}

test('Home 1814×772 · el castillo deja de ser una tira y ocupa la experiencia', async ({ page }) => {
  await page.setViewportSize({ width: 1814, height: 772 });
  await openHome(page);

  const view = await composition(page);
  expect(view.castle).not.toBeNull();
  expect(view.play).not.toBeNull();
  expect(view.dungeon).not.toBeNull();
  expect(view.castle.height).toBeGreaterThanOrEqual(500);
  expect(view.castle.width / view.castle.height).toBeLessThan(3.7);
  expect(view.castle.bottom).toBeLessThanOrEqual(view.viewportHeight + 2);
  expect(view.primaryDisplay).toBe('none');
  expect(view.modesGridDisplay).toBe('none');
  expect(view.play.top).toBeGreaterThanOrEqual(view.castle.top);
  expect(view.play.bottom).toBeLessThanOrEqual(view.castle.bottom + 2);
  expect(view.dungeon.bottom).toBeLessThanOrEqual(view.castle.bottom + 2);
  expect(view.camera).toBe('frontal-diorama-v1');
  expect(view.dungeonScene).toBe('spiral-stone-v1');
  expect(view.overflow).toBeLessThanOrEqual(1);
});

test('Home 1920×1080 · el Great Hall es la Home y no reaparece el dashboard', async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await openHome(page);

  const view = await composition(page);
  expect(view.castle).not.toBeNull();
  expect(view.castle.height).toBeGreaterThanOrEqual(780);
  expect(view.castle.height).toBeLessThanOrEqual(1080);
  expect(view.castle.width / view.castle.height).toBeLessThan(2.6);
  expect(view.primaryDisplay).toBe('none');
  expect(view.modesGridDisplay).toBe('none');
  expect(view.camera).toBe('frontal-diorama-v1');
  expect(view.dungeonScene).toBe('spiral-stone-v1');
  expect(view.overflow).toBeLessThanOrEqual(1);
});

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
  await expect(page.locator('.home-castle-life')).toBeVisible();
}

async function immersiveSnapshot(page) {
  return page.evaluate(() => {
    const menu = document.querySelector('.menu.home-friendly');
    const castle = menu?.querySelector(':scope > .home-castle-life');
    const oldPrimary = menu?.querySelector(':scope > .home-continue-group, :scope > .home-next-action');
    const oldModesGrid = menu?.querySelector(':scope > .home-modes-section > .home-primary-grid');
    const room = castle?.querySelector('.home-castle-hub__room--play');
    const roomTitle = room?.querySelector('strong');
    const dungeon = menu?.querySelector(':scope > .home-modes-section > .home-more-modes > summary');
    const study = menu?.querySelector(':scope > .home-primary-group:not(.home-modes-section) > .home-learning-more > summary');
    const scene = castle?.querySelector('.home-castle-hub__scene');
    const rect = (node) => {
      if (!node) return null;
      const box = node.getBoundingClientRect();
      return { top: box.top, right: box.right, bottom: box.bottom, left: box.left, width: box.width, height: box.height };
    };
    return {
      castle: rect(castle),
      oldPrimaryDisplay: oldPrimary ? getComputedStyle(oldPrimary).display : '',
      oldModesGridDisplay: oldModesGrid ? getComputedStyle(oldModesGrid).display : '',
      roomTitleOpacity: roomTitle ? Number.parseFloat(getComputedStyle(roomTitle).opacity) : 1,
      dungeon: rect(dungeon),
      study: rect(study),
      camera: scene?.dataset.homeCastleHubCamera || '',
      dungeonScene: scene?.dataset.homeCastleHubDungeonStair || '',
      viewportHeight: window.innerHeight,
      horizontalOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    };
  });
}

test('Home desktop · el castillo sustituye al dashboard a cualquier densidad', async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 768 });
  await openHome(page);

  for (const viewport of [
    { width: 1366, height: 768 },
    { width: 1536, height: 864 },
    { width: 1920, height: 1080 },
    { width: 2560, height: 1440 },
  ]) {
    await page.setViewportSize(viewport);
    const snapshot = await immersiveSnapshot(page);

    expect(snapshot.castle).not.toBeNull();
    expect(snapshot.castle.height).toBeGreaterThanOrEqual(Math.min(500, viewport.height * 0.64));
    expect(snapshot.castle.bottom).toBeLessThanOrEqual(viewport.height + 2);
    expect(snapshot.oldPrimaryDisplay).toBe('none');
    expect(snapshot.oldModesGridDisplay).toBe('none');
    expect(snapshot.roomTitleOpacity).toBeLessThanOrEqual(0.01);
    expect(snapshot.dungeon).not.toBeNull();
    expect(snapshot.study).not.toBeNull();
    expect(snapshot.dungeon.bottom).toBeLessThanOrEqual(snapshot.castle.bottom + 2);
    expect(snapshot.study.bottom).toBeLessThanOrEqual(snapshot.castle.bottom + 2);
    expect(snapshot.horizontalOverflow).toBeLessThanOrEqual(1);
  }
});

test('Home 1080p · las puertas hablan sólo al hover y conservan una única UI sobria', async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await openHome(page);

  const play = page.locator('.home-castle-hub__room--play');
  const title = play.locator('strong');
  const detail = play.locator('small');
  await expect(play).toBeVisible();

  expect(Number.parseFloat(await title.evaluate((node) => getComputedStyle(node).opacity))).toBeLessThanOrEqual(0.01);
  expect(Number.parseFloat(await detail.evaluate((node) => getComputedStyle(node).opacity))).toBeLessThanOrEqual(0.01);

  await play.hover();
  await expect.poll(async () => Number.parseFloat(await title.evaluate((node) => getComputedStyle(node).opacity))).toBeGreaterThan(0.9);
  await expect.poll(async () => Number.parseFloat(await detail.evaluate((node) => getComputedStyle(node).opacity))).toBeGreaterThan(0.9);

  const snapshot = await immersiveSnapshot(page);
  expect(snapshot.camera).toBe('frontal-diorama-v1');
  expect(snapshot.dungeonScene).toBe('spiral-stone-v1');

  const palette = await page.evaluate(() => {
    const room = document.querySelector('.home-castle-hub__room--play');
    const titleNode = room?.querySelector('strong');
    const card = room ? getComputedStyle(room, '::after') : null;
    return {
      titleColor: titleNode ? getComputedStyle(titleNode).color : '',
      cardBackground: card?.backgroundImage || '',
    };
  });
  expect(palette.titleColor).toMatch(/rgb\((24[01-9]|25[0-5]),\s*(21[0-9]|22[0-9]|23[0-9]),/);
  expect(palette.cardBackground).not.toBe('none');
});

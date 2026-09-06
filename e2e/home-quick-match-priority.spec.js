import { expect, test } from '@playwright/test';
import { login, mockApi } from './helpers.js';

async function dismissHomeGuide(page) {
  const guide = page.getByRole('region', { name: 'Guía rápida de Chess Studio' });
  if (await guide.isVisible().catch(() => false)) {
    await guide.getByRole('button', { name: 'Ahora no', exact: true }).click();
  }
}

async function openHome(page, mockOptions = {}) {
  await mockApi(page, mockOptions);
  await login(page);
  await dismissHomeGuide(page);
  await expect(page.getByRole('region', { name: 'Modos principales', exact: true })).toBeVisible();
}

async function expectQuickMatchAboveFold(page, viewport) {
  await page.setViewportSize(viewport);
  await openHome(page);

  const modes = page.getByRole('region', { name: 'Modos principales', exact: true });
  const firstMode = modes.locator('.home-primary-grid > .menu-card-shell > button').first();
  await expect(firstMode).toContainText('Partida rápida');
  await expect(firstMode).toContainText('Jugar ahora');

  const quickTitle = firstMode.getByRole('heading', { name: 'Partida rápida', exact: true });
  const titleBox = await quickTitle.boundingBox();
  expect(titleBox).not.toBeNull();
  expect(titleBox.y).toBeGreaterThanOrEqual(0);
  expect(titleBox.y + titleBox.height).toBeLessThanOrEqual(viewport.height);

  const hierarchy = await page.evaluate(() => {
    const modesSection = document.querySelector('.home-modes-section');
    const today = document.querySelector('.home-today-card');
    const quick = document.querySelector('.home-mode-quick');
    const tournament = document.querySelector('.home-mode-featured');
    const follows = (first, second) => Boolean(first && second && (first.compareDocumentPosition(second) & Node.DOCUMENT_POSITION_FOLLOWING));
    return {
      modesBeforeToday: follows(modesSection, today),
      quickBeforeTournament: follows(quick, tournament),
    };
  });

  expect(hierarchy.modesBeforeToday).toBe(true);
  expect(hierarchy.quickBeforeTournament).toBe(true);
}

test('Home desktop · la puerta JUGAR sustituye la tarjeta y abre Partida rápida', async ({ page }) => {
  await page.setViewportSize({ width: 1552, height: 900 });
  await openHome(page);

  const oldQuick = page.locator('.home-mode-quick');
  await expect(oldQuick).toBeHidden();

  const playDoor = page.locator('.home-castle-hub__room--play');
  await expect(playDoor).toBeVisible();
  await playDoor.click();
  await expect(page.getByRole('heading', { name: 'Elige dificultad y juega', exact: true })).toBeVisible();
});

test('Home desktop · el salón es frontal, sobrio y revela contexto sólo al hover', async ({ page }) => {
  await page.setViewportSize({ width: 1552, height: 900 });
  await openHome(page);

  const hall = page.locator('.home-castle-life');
  const scene = hall.locator('.home-castle-hub__scene');
  const canvas = scene.locator('canvas');
  const playDoor = hall.locator('.home-castle-hub__room--play');
  const roomTitle = playDoor.locator('strong');
  const roomDetail = playDoor.locator('small');
  const matthias = page.locator('.matthias-resident.is-viewport');

  await expect(hall).toBeVisible();
  await expect(scene).toBeVisible();
  await expect(canvas).toBeVisible();
  await expect(playDoor).toBeVisible();
  await expect(matthias).toBeVisible();

  expect(Number.parseFloat(await roomTitle.evaluate((node) => getComputedStyle(node).opacity))).toBeLessThanOrEqual(0.01);
  expect(Number.parseFloat(await roomDetail.evaluate((node) => getComputedStyle(node).opacity))).toBeLessThanOrEqual(0.01);

  await playDoor.hover();
  await expect.poll(async () => Number.parseFloat(await roomTitle.evaluate((node) => getComputedStyle(node).opacity))).toBeGreaterThan(0.9);
  await expect.poll(async () => Number.parseFloat(await roomDetail.evaluate((node) => getComputedStyle(node).opacity))).toBeGreaterThan(0.9);

  const visualContract = await page.evaluate(() => {
    const hallNode = document.querySelector('.home-castle-life');
    const sceneNode = hallNode?.querySelector('.home-castle-hub__scene');
    const matthiasNode = document.querySelector('.matthias-resident.is-viewport');
    const dungeon = document.querySelector('.home-more-modes > summary');
    const hallRect = hallNode?.getBoundingClientRect();
    const matthiasRect = matthiasNode?.getBoundingClientRect();
    return {
      hallHeight: hallRect?.height || 0,
      viewportHeight: window.innerHeight,
      camera: sceneNode?.dataset.homeCastleHubCamera || '',
      dungeonScene: sceneNode?.dataset.homeCastleHubDungeonStair || '',
      dungeonVisible: Boolean(dungeon && dungeon.getBoundingClientRect().width > 0 && dungeon.getBoundingClientRect().height > 0),
      matthiasInsideHallHorizontally: Boolean(hallRect && matthiasRect
        && matthiasRect.left >= hallRect.left
        && matthiasRect.right <= hallRect.right),
      horizontalOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    };
  });

  expect(visualContract.hallHeight).toBeGreaterThanOrEqual(600);
  expect(visualContract.hallHeight).toBeLessThanOrEqual(visualContract.viewportHeight);
  expect(visualContract.camera).toBe('frontal-diorama-v1');
  expect(visualContract.dungeonScene).toBe('spiral-stone-v1');
  expect(visualContract.dungeonVisible).toBe(true);
  expect(visualContract.matthiasInsideHallHorizontally).toBe(true);
  expect(visualContract.horizontalOverflow).toBeLessThanOrEqual(1);
});

test('Home móvil · Partida rápida sigue visible sin scroll y es la primera opción', async ({ page }) => {
  await expectQuickMatchAboveFold(page, { width: 360, height: 640 });
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
});

test('Home Android admin · player, estado y aviso no expulsan Partida rápida del primer viewport', async ({ page }) => {
  const viewport = { width: 360, height: 640 };
  await page.setViewportSize(viewport);
  await openHome(page, { isAdmin: true });

  const modes = page.getByRole('region', { name: 'Modos principales', exact: true });
  const quick = modes.locator('.home-mode-quick');
  await expect(quick).toContainText('Partida rápida');

  await quick.click();
  await expect(page.getByRole('heading', { name: 'Elige dificultad y juega', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Empezar partida', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Salir al menú', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Salir al menú', exact: true }).click();
  await expect(page.getByRole('heading', { name: '¿Abandonar la partida?', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Cancelar sin penalización', exact: true }).click();

  await expect(page.getByText('Partida cancelada', { exact: true })).toBeVisible();
  await expect(page.locator('.live-service-status')).toBeVisible();
  await expect(modes).toBeVisible();

  const layout = await page.evaluate(() => {
    const dock = document.querySelector('.global-music-dock');
    const status = dock?.querySelector('.live-service-status');
    const notice = document.querySelector('.session-result-notice');
    const modesSection = document.querySelector('.home-modes-section');
    const hall = document.querySelector('.home-castle-life');
    const quickTitle = document.querySelector('.home-mode-quick h3');
    const dockRect = dock?.getBoundingClientRect();
    const modesRect = modesSection?.getBoundingClientRect();
    const hallRect = hall?.getBoundingClientRect();
    const quickRect = quickTitle?.getBoundingClientRect();

    return {
      dockPosition: dock ? getComputedStyle(dock).position : '',
      dockWidth: dockRect?.width || 0,
      statusPosition: status ? getComputedStyle(status).position : '',
      noticePosition: notice ? getComputedStyle(notice).position : '',
      modesTop: modesRect?.top ?? Number.POSITIVE_INFINITY,
      hallTop: hallRect?.top ?? Number.NEGATIVE_INFINITY,
      quickBottom: quickRect?.bottom ?? Number.POSITIVE_INFINITY,
      viewportHeight: window.innerHeight,
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    };
  });

  expect(layout.dockPosition).toBe('fixed');
  expect(layout.dockWidth).toBeLessThanOrEqual(80);
  expect(layout.statusPosition).toBe('absolute');
  expect(layout.noticePosition).toBe('fixed');
  expect(layout.modesTop).toBeLessThan(layout.hallTop);
  expect(layout.quickBottom).toBeLessThanOrEqual(layout.viewportHeight);
  expect(layout.overflow).toBeLessThanOrEqual(1);
});

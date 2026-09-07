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

test('Home desktop · Partida rápida queda visible sin scroll y lidera Jugar', async ({ page }) => {
  await expectQuickMatchAboveFold(page, { width: 1552, height: 900 });
});

test('Home desktop · el salón mantiene render 3D nítido y Matthias vive junto al sofá', async ({ page }) => {
  await page.setViewportSize({ width: 1552, height: 900 });
  await openHome(page);

  const hall = page.locator('.home-castle-life');
  const scene = hall.locator('.home-castle-hub__scene');
  const canvas = scene.locator('canvas');
  const roomTitle = hall.locator('.home-castle-hub__room strong').first();
  const roomDetail = hall.locator('.home-castle-hub__room small').first();
  const matthias = page.locator('.matthias-resident.is-viewport');

  await expect(hall).toBeVisible();
  await expect(scene).toBeVisible();
  await expect(canvas).toBeVisible();
  await expect(roomTitle).toBeVisible();
  await expect(roomDetail).toBeVisible();
  await expect(matthias).toBeVisible();

  const visualContract = await page.evaluate(() => {
    const hallNode = document.querySelector('.home-castle-life');
    const hubNode = hallNode?.querySelector('.home-castle-hub');
    const sceneNode = hallNode?.querySelector('.home-castle-hub__scene');
    const canvasNode = hallNode?.querySelector('.home-castle-hub__scene canvas');
    const titleNode = hallNode?.querySelector('.home-castle-hub__room strong');
    const detailNode = hallNode?.querySelector('.home-castle-hub__room small');
    const matthiasNode = document.querySelector('.matthias-resident.is-viewport');
    const hallRect = hallNode?.getBoundingClientRect();
    const matthiasRect = matthiasNode?.getBoundingClientRect();
    const hallStyle = hallNode ? getComputedStyle(hallNode) : null;
    const titleStyle = titleNode ? getComputedStyle(titleNode) : null;
    const detailStyle = detailNode ? getComputedStyle(detailNode) : null;
    const beforeStyle = hubNode ? getComputedStyle(hubNode, '::before') : null;
    const afterStyle = hubNode ? getComputedStyle(hubNode, '::after') : null;

    return {
      hallOpacity: hallStyle ? Number.parseFloat(hallStyle.opacity) : 0,
      hallFilter: hallStyle?.filter || '',
      sceneFilter: sceneNode ? getComputedStyle(sceneNode).filter : '',
      canvasFilter: canvasNode ? getComputedStyle(canvasNode).filter : '',
      beforeOpacity: beforeStyle ? Number.parseFloat(beforeStyle.opacity) : 1,
      afterOpacity: afterStyle ? Number.parseFloat(afterStyle.opacity) : 1,
      titleFontSize: titleStyle ? Number.parseFloat(titleStyle.fontSize) : 0,
      detailOpacity: detailStyle ? Number.parseFloat(detailStyle.color.match(/[\d.]+(?=\))/)?.[0] || '1') : 0,
      matthiasLowerHalf: Boolean(hallRect && matthiasRect && matthiasRect.top >= hallRect.top + hallRect.height * 0.34),
      matthiasInsideHallHorizontally: Boolean(hallRect && matthiasRect
        && matthiasRect.left >= hallRect.left
        && matthiasRect.right <= hallRect.right),
      matthiasWidth: matthiasRect?.width || 0,
    };
  });

  expect(visualContract.hallOpacity).toBe(1);
  expect(visualContract.hallFilter).toBe('none');
  expect(visualContract.sceneFilter).toBe('none');
  expect(visualContract.canvasFilter).toBe('none');
  expect(visualContract.beforeOpacity).toBe(0);
  expect(visualContract.afterOpacity).toBe(0);
  expect(visualContract.titleFontSize).toBeGreaterThanOrEqual(14);
  expect(visualContract.matthiasLowerHalf).toBe(true);
  expect(visualContract.matthiasInsideHallHorizontally).toBe(true);
  expect(visualContract.matthiasWidth).toBeGreaterThanOrEqual(175);
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

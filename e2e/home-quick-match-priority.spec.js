import { expect, test } from '@playwright/test';
import { login, mockApi } from './helpers.js';

async function openHome(page) {
  await mockApi(page);
  await login(page);
  const guide = page.getByRole('region', { name: 'Guía rápida de Chess Studio' });
  if (await guide.isVisible().catch(() => false)) {
    await guide.getByRole('button', { name: 'Ahora no', exact: true }).click();
  }
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

test('Home desktop · el salón mantiene el grade cálido legible y Matthias vive junto al sofá', async ({ page }) => {
  await page.setViewportSize({ width: 1552, height: 900 });
  await openHome(page);

  const hall = page.locator('.home-castle-life');
  const scene = hall.locator('.home-castle-hub__scene');
  const roomTitle = hall.locator('.home-castle-hub__room strong').first();
  const roomDetail = hall.locator('.home-castle-hub__room small').first();
  const matthias = page.locator('.matthias-resident.is-viewport');

  await expect(hall).toBeVisible();
  await expect(scene).toBeVisible();
  await expect(roomTitle).toBeVisible();
  await expect(roomDetail).toBeVisible();
  await expect(matthias).toBeVisible();

  const visualContract = await page.evaluate(() => {
    const hallNode = document.querySelector('.home-castle-life');
    const sceneNode = hallNode?.querySelector('.home-castle-hub__scene');
    const canvasNode = hallNode?.querySelector('.home-castle-hub__scene canvas');
    const titleNode = hallNode?.querySelector('.home-castle-hub__room strong');
    const detailNode = hallNode?.querySelector('.home-castle-hub__room small');
    const matthiasNode = document.querySelector('.matthias-resident.is-viewport');
    const hallRect = hallNode?.getBoundingClientRect();
    const matthiasRect = matthiasNode?.getBoundingClientRect();
    const titleStyle = titleNode ? getComputedStyle(titleNode) : null;
    const detailStyle = detailNode ? getComputedStyle(detailNode) : null;

    return {
      sceneFilter: sceneNode ? getComputedStyle(sceneNode).filter : '',
      canvasFilter: canvasNode ? getComputedStyle(canvasNode).filter : '',
      titleFontSize: titleStyle ? Number.parseFloat(titleStyle.fontSize) : 0,
      detailOpacity: detailStyle ? Number.parseFloat(detailStyle.color.match(/[\d.]+(?=\))/)?.[0] || '1') : 0,
      matthiasLowerHalf: Boolean(hallRect && matthiasRect && matthiasRect.top >= hallRect.top + hallRect.height * 0.34),
      matthiasInsideHallHorizontally: Boolean(hallRect && matthiasRect
        && matthiasRect.left >= hallRect.left
        && matthiasRect.right <= hallRect.right),
      matthiasWidth: matthiasRect?.width || 0,
    };
  });

  expect(visualContract.sceneFilter).toContain('brightness(1.56)');
  expect(visualContract.canvasFilter).toContain('brightness(1.31)');
  expect(visualContract.titleFontSize).toBeGreaterThanOrEqual(14);
  expect(visualContract.matthiasLowerHalf).toBe(true);
  expect(visualContract.matthiasInsideHallHorizontally).toBe(true);
  expect(visualContract.matthiasWidth).toBeGreaterThanOrEqual(175);
});

test('Home móvil · Partida rápida sigue visible sin scroll y es la primera opción', async ({ page }) => {
  await expectQuickMatchAboveFold(page, { width: 390, height: 844 });
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
});

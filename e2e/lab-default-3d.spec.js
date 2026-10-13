import { expect, test } from '@playwright/test';
import { buttonWithHeading, login, mockApi, openMoreGameModes } from './helpers.js';

test('Laboratorio libre · el editor usa 3D por defecto en un dispositivo limpio', async ({ page }) => {
  await mockApi(page);
  await login(page);

  const moreModes = await openMoreGameModes(page);
  await buttonWithHeading(moreModes, 'Laboratorio').click();
  await expect(page.getByRole('heading', { name: 'Experimentos geniales', exact: true })).toBeVisible();

  await buttonWithHeading(page, 'Laboratorio libre').click();
  await expect(page.getByRole('heading', { name: 'Prepara una posición y juega', exact: true })).toBeVisible();
  await expect(page.locator('.lab-board-editor [data-board3d-war-room="true"]')).toBeVisible({ timeout: 30_000 });
  const stage = await page.locator('.lab-position-stage').boundingBox();
  const controls = await page.locator('.lab-position-controls').boundingBox();
  expect(stage).not.toBeNull();
  expect(controls).not.toBeNull();
  expect(stage.y, 'editor board starts in first viewport').toBeLessThan(440);
  expect(controls.x, 'instruments sit alongside board on desktop').toBeGreaterThan(stage.x + stage.width - 2);
  await expect(page.getByRole('button', { name: 'Jugar esta posición', exact: true })).toBeInViewport();
  await expect(page.locator('.lab-brush[aria-pressed="true"]')).toHaveCount(1);
});

test('Laboratorio libre · herramientas táctiles sin desbordamiento móvil', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await mockApi(page);
  await login(page);
  const moreModes = await openMoreGameModes(page);
  await buttonWithHeading(moreModes, 'Laboratorio').click();
  await buttonWithHeading(page, 'Laboratorio libre').click();

  const workspace = page.locator('.lab-position-workspace');
  await expect(workspace).toBeVisible();
  const health = await page.evaluate(() => ({
    overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
    board: document.querySelector('.lab-position-stage')?.getBoundingClientRect().toJSON(),
    tools: document.querySelector('.lab-position-tools')?.getBoundingClientRect().toJSON(),
  }));
  expect(health.overflow).toBe(false);
  expect(health.tools.y).toBeGreaterThan(health.board.y);
  const whiteKing = page.getByRole('button', { name: 'Colocar ♔ blanco' });
  await expect(whiteKing).toBeVisible();
  const box = await whiteKing.boundingBox();
  expect(box.width).toBeGreaterThanOrEqual(44);
  expect(box.height).toBeGreaterThanOrEqual(44);
  await whiteKing.click();
  await expect(whiteKing).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('button', { name: 'Posición inicial', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Jugar esta posición', exact: true })).toBeVisible();
});

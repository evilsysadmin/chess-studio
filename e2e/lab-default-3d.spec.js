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
  const whiteKing = page.getByRole('button', { name: 'Colocar ♔ blanco' });
  for (const width of [360, 390, 430]) {
    await page.setViewportSize({ width, height: 844 });
    const health = await page.evaluate(() => ({
      overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
      board: document.querySelector('.lab-position-stage')?.getBoundingClientRect().toJSON(),
      tools: document.querySelector('.lab-position-tools')?.getBoundingClientRect().toJSON(),
    }));
    expect(health.overflow, `${width}px: no horizontal overflow`).toBe(false);
    expect(health.board.y, `${width}px: board begins in first viewport`).toBeLessThan(844);
    expect(health.tools.y, `${width}px: tools follow board`).toBeGreaterThan(health.board.y);
    await expect(whiteKing).toBeVisible();
    const box = await whiteKing.boundingBox();
    expect(box.width, `${width}px: touch target width`).toBeGreaterThanOrEqual(44);
    expect(box.height, `${width}px: touch target height`).toBeGreaterThanOrEqual(44);
    // The palette is below the board on mobile: selecting a piece should
    // bring the playable board back without requiring a manual reverse scroll.
    await whiteKing.click();
    await expect(whiteKing).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('.lab-position-stage-head [aria-live="polite"]')).toContainText('Pieza ♔ seleccionada');
    const boardTop = async () => (await page.locator('.lab-position-stage').boundingBox())?.y ?? -Infinity;
    await expect.poll(boardTop).toBeGreaterThanOrEqual(240);
    await expect.poll(boardTop).toBeLessThan(410);
    const headingClear = await page.getByRole('heading', { name: 'Prepara una posición y juega' }).evaluate((heading) => {
      const rect = heading.getBoundingClientRect();
      const x = rect.left + Math.min(16, rect.width / 4);
      const y = rect.top + Math.min(20, rect.height / 2);
      const hit = document.elementFromPoint(x, y);
      return y >= 0 && y < window.innerHeight && Boolean(hit && (hit === heading || heading.contains(hit)));
    });
    expect(headingClear, `${width}px: audio must not obscure editor heading`).toBe(true);
    // Verify a real pointer action at the left edge of the mode tab without
    // Playwright auto-scrolling it away from the fixed music player.
    const modeTab = page.getByRole('tab', { name: 'Posición normal' });
    const tabBox = await modeTab.boundingBox();
    expect(tabBox, `${width}px: mode tab has a hit area`).not.toBeNull();
    await page.mouse.click(tabBox.x + Math.min(16, tabBox.width / 4), tabBox.y + tabBox.height / 2);
    await expect(modeTab, `${width}px: mode tab receives the pointer event`).toBeFocused();
  }
  await expect(page.getByRole('button', { name: 'Posición inicial', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Jugar esta posición', exact: true })).toBeVisible();
});

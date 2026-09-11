import { expect, test } from '@playwright/test';
import { buttonWithVisibleText, gameStatus, login, mockApi } from './helpers.js';

async function expectInsideViewport(locator, page, label) {
  await expect(locator, label).toBeVisible();
  const box = await locator.boundingBox();
  expect(box, `${label}: bounding box`).not.toBeNull();
  const viewport = page.viewportSize();
  expect(viewport).not.toBeNull();
  expect(box.x, `${label}: left`).toBeGreaterThanOrEqual(-1);
  expect(box.y, `${label}: top`).toBeGreaterThanOrEqual(-1);
  expect(box.x + box.width, `${label}: right`).toBeLessThanOrEqual(viewport.width + 1);
  expect(box.y + box.height, `${label}: bottom`).toBeLessThanOrEqual(viewport.height + 1);
}

async function expectNoHorizontalOverflow(page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
}

test('Móvil · acciones y Apariencia de partida no escapan del viewport a 360/390/430', async ({ page }) => {
  test.setTimeout(90_000);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize({ width: 430, height: 820 });
  await mockApi(page);
  await login(page);

  await buttonWithVisibleText(page, 'Partida rápida').click();
  await page.getByRole('button', { name: 'Empezar partida', exact: true }).click();
  await expect(gameStatus(page)).toBeVisible();
  await expect(page.locator('[data-board3d-war-room="true"]')).toBeVisible({ timeout: 30_000 });

  for (const width of [360, 390, 430]) {
    await page.setViewportSize({ width, height: 820 });
    await expectNoHorizontalOverflow(page);

    const utility = page.getByRole('button', { name: 'Más acciones de partida', exact: true });
    await expectInsideViewport(utility, page, `${width}px utility button`);
    await utility.click();

    const appearance = page.getByRole('menuitem', { name: 'Apariencia', exact: true });
    await expectInsideViewport(appearance, page, `${width}px appearance menuitem`);
    const visibleMenuItems = page.getByRole('menuitem').filter({ visible: true });
    const count = await visibleMenuItems.count();
    for (let index = 0; index < count; index += 1) {
      await expectInsideViewport(visibleMenuItems.nth(index), page, `${width}px menuitem ${index}`);
    }
    await expectNoHorizontalOverflow(page);

    await appearance.click();
    const dialog = page.getByRole('dialog', { name: 'Ajustes' });
    await expectInsideViewport(dialog, page, `${width}px settings dialog`);
    await expect(page.locator('[data-board3d-war-room="true"]')).toHaveCount(1);
    await expect(page.locator('.error-boundary-screen')).toHaveCount(0);
    await expectNoHorizontalOverflow(page);

    await dialog.getByRole('button', { name: 'Cerrar', exact: true }).click();
    await expect(dialog).toBeHidden();
  }
});

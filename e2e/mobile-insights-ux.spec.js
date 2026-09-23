import { expect, test } from '@playwright/test';
import { login, mockApi } from './helpers.js';

test('Así juegas móvil · navegación completa sin carrusel horizontal', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await mockApi(page);
  await login(page);

  await page.locator('.illustrated-home__matthias').click();
  const workspace = page.locator('.insights-coach-workspace');
  await expect(workspace).toBeVisible();

  for (const width of [360, 390, 430]) {
    await page.setViewportSize({ width, height: 844 });

    const primaryTabs = workspace.locator('.insights-workspace-primary-tabs > button');
    await expect(primaryTabs).toHaveCount(2);
    for (let index = 0; index < 2; index += 1) {
      const box = await primaryTabs.nth(index).boundingBox();
      expect(box).not.toBeNull();
      expect(box.height).toBeGreaterThanOrEqual(44);
    }

    const nav = workspace.locator('.insights-workspace-nav');
    const diagnosisTabs = nav.locator('> button');
    await expect(diagnosisTabs).toHaveCount(3);

    const navMetrics = await nav.evaluate((node) => ({
      scrollWidth: node.scrollWidth,
      clientWidth: node.clientWidth,
    }));
    expect(navMetrics.scrollWidth).toBeLessThanOrEqual(navMetrics.clientWidth + 1);

    const boxes = [];
    for (let index = 0; index < 3; index += 1) {
      const box = await diagnosisTabs.nth(index).boundingBox();
      expect(box).not.toBeNull();
      expect(box.height).toBeGreaterThanOrEqual(48);
      boxes.push(box);
    }
    expect(Math.max(...boxes.map((box) => box.y)) - Math.min(...boxes.map((box) => box.y))).toBeLessThanOrEqual(2);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
  }
});

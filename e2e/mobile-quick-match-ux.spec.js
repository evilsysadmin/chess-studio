import { expect, test } from '@playwright/test';
import { login, mockApi } from './helpers.js';

test('Partida rápida móvil · Matthias y Empezar dominan el primer viewport', async ({ page }) => {
  await mockApi(page);
  await login(page);

  for (const width of [360, 390, 430]) {
    await page.setViewportSize({ width, height: 844 });
    await page.locator('.illustrated-home__destination--play').click();

    const dialog = page.getByRole('dialog', { name: 'Configurar partida rápida' });
    await expect(dialog).toBeVisible();

    const cpu = dialog.getByRole('button', { name: /Jugar contra Matthias/ });
    const start = dialog.getByRole('button', { name: 'Empezar partida', exact: true });
    const pvp = dialog.getByRole('button', { name: /Jugar contra una persona/ });

    const cpuBox = await cpu.boundingBox();
    const startBox = await start.boundingBox();
    const pvpBox = await pvp.boundingBox();
    expect(cpuBox).not.toBeNull();
    expect(startBox).not.toBeNull();
    expect(pvpBox).not.toBeNull();
    expect(cpuBox.height).toBeGreaterThanOrEqual(58);
    expect(startBox.height).toBeGreaterThanOrEqual(52);
    expect(startBox.y + startBox.height).toBeLessThanOrEqual(844);
    expect(cpuBox.y).toBeLessThan(startBox.y);
    expect(startBox.y).toBeLessThan(pvpBox.y);

    const settings = dialog.locator('.quick-match-settings > summary');
    const settingsBox = await settings.boundingBox();
    expect(settingsBox).not.toBeNull();
    expect(settingsBox.height).toBeGreaterThanOrEqual(44);

    await settings.click();
    const rendererButtons = dialog.locator('.quick-match-renderer-choice > button');
    await expect(rendererButtons).toHaveCount(2);
    for (let index = 0; index < 2; index += 1) {
      const box = await rendererButtons.nth(index).boundingBox();
      expect(box).not.toBeNull();
      expect(box.height).toBeGreaterThanOrEqual(44);
    }

    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
    await dialog.getByRole('button', { name: 'Cerrar', exact: true }).click();
  }
});

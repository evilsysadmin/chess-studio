import { expect, test } from '@playwright/test';
import { buttonWithVisibleText, login, mockApi } from './helpers.js';

for (const viewport of [
  { width: 360, height: 800 },
  { width: 390, height: 844 },
  { width: 430, height: 932 },
]) {
  test(`Mobile golden path · Partida rápida prioriza empezar en ${viewport.width}px`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await mockApi(page, {
      profileSeed: {
        'matthias.onboarded': '2',
        'chess-study-home-guide-dismissed-v1': '1',
      },
    });
    await login(page);

    await buttonWithVisibleText(page, 'Partida rápida').click();
    const dialog = page.getByRole('dialog', { name: 'Configurar partida rápida' });
    await expect(dialog).toBeVisible();

    const start = dialog.getByRole('button', { name: 'Empezar partida', exact: true });
    const tuning = dialog.locator('details.quick-match-post-cta-tools > summary');
    const manual = dialog.getByRole('button', { name: 'Elegir nivel manualmente', exact: true });
    const settings = dialog.locator('details.quick-match-settings > summary');

    await expect(start).toBeVisible();
    await expect(tuning).toBeVisible();
    await expect(manual).toBeHidden();
    await expect(settings).toBeVisible();

    const [startBox, tuningBox, settingsBox] = await Promise.all([
      start.boundingBox(),
      tuning.boundingBox(),
      settings.boundingBox(),
    ]);
    expect(startBox).not.toBeNull();
    expect(tuningBox).not.toBeNull();
    expect(settingsBox).not.toBeNull();

    expect(startBox.y).toBeLessThan(tuningBox.y);
    expect(startBox.y).toBeLessThan(settingsBox.y);
    expect(startBox.y + startBox.height).toBeLessThanOrEqual(viewport.height + 1);
    expect(startBox.height).toBeGreaterThanOrEqual(44);
    expect(tuningBox.height).toBeGreaterThanOrEqual(44);
    expect(settingsBox.height).toBeGreaterThanOrEqual(44);
    expect(startBox.x).toBeGreaterThanOrEqual(0);
    expect(startBox.x + startBox.width).toBeLessThanOrEqual(viewport.width + 1);

    await tuning.click();
    await expect(manual).toBeVisible();
    const manualBox = await manual.boundingBox();
    expect(manualBox).not.toBeNull();
    expect(manualBox.height).toBeGreaterThanOrEqual(44);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1)).toBe(true);
  });
}

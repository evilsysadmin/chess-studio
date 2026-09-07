import { expect, test } from '@playwright/test';
import { login, mockApi } from './helpers.js';

for (const viewport of [{ width: 1672, height: 941 }, { width: 1814, height: 772 }, { width: 1024, height: 768 }]) {
  test(`illustrated Home keeps controls attached to art at ${viewport.width}×${viewport.height}`, async ({ page }, testInfo) => {
    await page.setViewportSize(viewport);
    await mockApi(page);
    await login(page);
    const art = page.locator('.illustrated-home__art');
    await expect(art).toBeVisible();
    await expect.poll(() => art.evaluate(img => img.complete && img.naturalWidth > 0)).toBe(true);
    await expect(page.locator('.home-castle-hub__scene canvas')).toHaveCount(0);
    for (const id of ['play', 'tournament', 'train', 'combat', 'daily', 'history']) {
      const control = page.locator(`.illustrated-home__destination--${id}`);
      await expect(control).toBeVisible();
      expect(await control.evaluate(el => {
        const r = el.getBoundingClientRect();
        return el.contains(document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2));
      })).toBe(true);
    }
    const overflow = await page.evaluate(() => [...document.querySelectorAll('body *')].filter(el => el.getBoundingClientRect().right > innerWidth + 1).map(el => [el.className, Math.round(el.getBoundingClientRect().right)]));
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), JSON.stringify(overflow)).toBe(true);
    if (viewport.width === 1672) await page.screenshot({ path: testInfo.outputPath('chess-studio-home.png') });
    await page.locator('.illustrated-home__destination--play').focus();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('dialog')).toBeVisible();
  });
}

test('illustrated Home reuses account and feedback controls', async ({ page }) => {
  await page.setViewportSize({ width: 1672, height: 941 });
  await mockApi(page);
  await login(page);
  await page.getByRole('button', { name: 'Abrir menú de cuenta' }).click();
  await expect(page.getByRole('menu', { name: 'Cuenta' })).toBeVisible();
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Enviar feedback', exact: true }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
});

test('illustrated Home keeps the admin inbox actionable', async ({ page }) => {
  await page.setViewportSize({ width: 1672, height: 941 });
  await mockApi(page, { isAdmin: true, initialFeedback: [{ id: 'home-inbox', category: 'general', message: 'Home feedback', status: 'new' }] });
  await login(page);
  await page.getByRole('button', { name: '1 feedback nuevo', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Centro de control' })).toBeVisible();
  await page.getByRole('tab', { name: /Feedback/ }).click();
  await expect(page.getByRole('region', { name: 'Feedback de usuarios' })).toBeVisible();
});

import { expect, test } from '@playwright/test';
import { login, mockApi } from './helpers.js';

async function dismissHomeGuide(page) {
  const guide = page.getByRole('region', { name: 'Guía rápida de Chess Studio' });
  if (await guide.isVisible().catch(() => false)) {
    await guide.getByRole('button', { name: 'Ahora no', exact: true }).click();
  }
}

test('Home · Matthias usa un canvas Three.js y un único arte canónico, no cinco recortes raster', async ({ page }) => {
  await page.addInitScript(() => {
    Math.random = () => 0;
    Date.prototype.getHours = () => 16;
    localStorage.setItem('chess-study-reduced-motion', '0');
  });
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await mockApi(page);
  await login(page);
  await dismissHomeGuide(page);

  const corner = page.getByRole('complementary', { name: 'Rincón de Matthias' });
  await expect(corner).toBeVisible();
  const avatar = corner.locator('[data-matthias-three-avatar="true"]');
  await expect(avatar).toBeVisible();
  await expect(avatar).toHaveAttribute('data-three-profile', 'write');
  await expect(corner.locator('[data-matthias-layered-art="true"]')).toHaveCount(0);
  await expect(corner.locator('[data-matthias-art-part]')).toHaveCount(0);

  const canonical = avatar.locator('img[data-matthias-canonical-art="true"]');
  await expect(canonical).toHaveCount(1);
  await expect(canonical).toHaveAttribute('src', /\.webp(?:$|\?)/);
  await expect.poll(
    () => canonical.evaluate((img) => img.complete && img.naturalWidth > 0 && img.naturalHeight > 0),
    { message: 'el fallback/textura de Matthias debe ser una imagen real' },
  ).toBe(true);

  await expect(avatar.locator('canvas')).toHaveCount(1);
  await expect.poll(() => avatar.getAttribute('data-three-ready'), { timeout: 4_000 }).toBe('true');
  await expect(avatar).toHaveAttribute('data-three-failed', 'false');
  await expect.poll(async () => Number(await avatar.getAttribute('data-three-frame')) || 0, { timeout: 4_000 }).toBeGreaterThan(6);
  await expect.poll(async () => Number(await avatar.getAttribute('data-three-energy')) || 0, { timeout: 4_000 }).toBeGreaterThan(.08);
});

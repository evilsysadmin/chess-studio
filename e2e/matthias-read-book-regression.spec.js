import { expect, test } from '@playwright/test';
import { login, mockApi } from './helpers.js';

async function openReadingHome(page) {
  await page.addInitScript(() => {
    Math.random = () => 0;
    Date.prototype.getHours = () => 23;
  });
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await mockApi(page);
  await login(page);

  const guide = page.getByRole('region', { name: 'Guía rápida de Chess Studio' });
  if (await guide.isVisible().catch(() => false)) {
    await guide.getByRole('button', { name: 'Ahora no', exact: true }).click();
  }

  const corner = page.getByRole('complementary', { name: 'Rincón de Matthias' });
  await expect(corner).toBeVisible();
  const dismiss = corner.getByRole('button', { name: 'Cerrar comentario de Matthias', exact: true });
  if (await dismiss.isVisible().catch(() => false)) await dismiss.click();
  return corner;
}

test('Leyendo estrategia · Matthias full 3D anima cabeza y mirada sin capas raster flotantes', async ({ page }) => {
  const corner = await openReadingHome(page);
  const frame = corner.locator('[data-portrait-frame="true"]');
  const avatar = frame.locator('[data-matthias-three-avatar="true"]');

  await expect(avatar).toHaveAttribute('data-three-profile', 'read');
  await expect(avatar).toHaveAttribute('data-three-motion', 'active');
  await expect(avatar).toHaveAttribute('data-three-render-mode', 'full-3d-rig');
  await expect(avatar).toHaveAttribute('data-three-full-3d', 'true');
  await expect(frame.locator('[data-matthias-art-part]')).toHaveCount(0);
  await expect(frame.locator('[data-matthias-layered-art="true"]')).toHaveCount(0);
  await expect.poll(() => avatar.getAttribute('data-three-ready'), { timeout: 4_000 }).toBe('true');
  await expect(avatar).toHaveAttribute('data-three-failed', 'false');

  const firstFrame = Number(await avatar.getAttribute('data-three-frame')) || 0;
  await expect.poll(async () => Number(await avatar.getAttribute('data-three-frame')) || 0, { timeout: 3_000 }).toBeGreaterThan(firstFrame + 5);
  await expect.poll(async () => Number(await avatar.getAttribute('data-three-energy')) || 0, { timeout: 3_000 }).toBeGreaterThan(.08);
  await expect.poll(async () => Number(await avatar.getAttribute('data-three-head-yaw')) || 0, { timeout: 3_000 }).toBeGreaterThan(.02);

  const canonical = avatar.locator('img[data-matthias-canonical-art="true"]');
  await expect(canonical).toHaveAttribute('src', /^(?:data:image\/webp;base64,|.*\.webp(?:$|\?))/);
  await expect.poll(() => canonical.evaluate((img) => img.complete && img.naturalWidth > 0)).toBe(true);
});

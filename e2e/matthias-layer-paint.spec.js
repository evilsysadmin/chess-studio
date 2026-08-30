import { expect, test } from '@playwright/test';
import { login, mockApi } from './helpers.js';

async function dismissHomeGuide(page) {
  const guide = page.getByRole('region', { name: 'Guía rápida de Chess Studio' });
  if (await guide.isVisible().catch(() => false)) {
    await guide.getByRole('button', { name: 'Ahora no', exact: true }).click();
  }
}

test('Home · las capas animables de Matthias son imágenes reales, no cajas vacías', async ({ page }) => {
  await page.addInitScript(() => {
    Math.random = () => 0;
    Date.prototype.getHours = () => 15;
    localStorage.setItem('chess-study-reduced-motion', '0');
  });
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await mockApi(page);
  await login(page);
  await dismissHomeGuide(page);

  const corner = page.getByRole('complementary', { name: 'Rincón de Matthias' });
  await expect(corner).toBeVisible();
  const rig = corner.locator('[data-matthias-layered-art="true"]');
  await expect(rig).toBeVisible();

  for (const part of ['head', 'eyes', 'left-arm', 'right-arm', 'prop']) {
    const layer = rig.locator(`[data-matthias-art-part="${part}"]`);
    await expect(layer).toHaveCount(1);
    await expect(layer).toHaveJSProperty('tagName', 'IMG');
    await expect(layer).toHaveAttribute('src', /\.webp(?:$|\?)/);
    await expect.poll(
      () => layer.evaluate((img) => img.complete && img.naturalWidth > 0 && img.naturalHeight > 0),
      { message: `${part}: la capa articulada debe decodificar una imagen real` },
    ).toBe(true);
  }

  const rightArm = rig.locator('[data-matthias-art-part="right-arm"]');
  const before = await rightArm.evaluate((node) => getComputedStyle(node).transform);
  await expect.poll(
    async () => Number(await rig.getAttribute('data-gesture-count')),
    { timeout: 2_000 },
  ).toBeGreaterThan(0);
  await expect.poll(
    () => rightArm.evaluate((node) => getComputedStyle(node).transform),
    { timeout: 2_000 },
  ).not.toBe(before);
});

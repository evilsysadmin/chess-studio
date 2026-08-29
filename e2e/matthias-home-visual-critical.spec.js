import { expect, test } from '@playwright/test';
import { login, mockApi } from './helpers.js';

async function dismissHomeGuide(page) {
  const guide = page.getByRole('region', { name: 'Guía rápida de Chess Studio' });
  if (await guide.isVisible().catch(() => false)) {
    await guide.getByRole('button', { name: 'Ahora no', exact: true }).click();
  }
}

test('Home · el avatar residente de Matthias abre Así juegas y carga el retrato', async ({ page }) => {
  await mockApi(page);
  await login(page);
  await dismissHomeGuide(page);

  const corner = page.getByRole('complementary', { name: 'Rincón de Matthias' });
  await expect(corner).toBeVisible();

  const matthias = corner.getByRole('button', { name: 'Abrir Así juegas con Matthias', exact: true });
  await expect(matthias).toBeVisible();

  const portrait = matthias.locator('img');
  await expect(portrait).toBeVisible();
  await expect.poll(
    () => portrait.evaluate((img) => img.complete && img.naturalWidth > 0 && img.naturalHeight > 0),
    { message: 'El retrato de Matthias debe haberse decodificado realmente' },
  ).toBe(true);

  await matthias.click();
  await expect(page.getByRole('heading', { name: 'Así juegas', exact: true })).toBeVisible();
});

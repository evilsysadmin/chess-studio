import { expect, test } from '@playwright/test';
import { login, mockApi } from './helpers.js';

async function dismissHomeGuide(page) {
  const guide = page.getByRole('region', { name: 'Guía rápida de Chess Studio' });
  if (await guide.isVisible().catch(() => false)) {
    await guide.getByRole('button', { name: 'Ahora no', exact: true }).click();
  }
}

async function dismissMatthiasSpeech(corner) {
  const dismiss = corner.getByRole('button', { name: 'Cerrar comentario de Matthias', exact: true });
  if (await dismiss.isVisible().catch(() => false)) await dismiss.click();
}

async function expectPortraitMotion(page, shell, label) {
  await expect(shell).toBeVisible();
  const animationName = await shell.evaluate((node) => getComputedStyle(node).animationName);
  expect(animationName, `${label}: el portrait-shell debe tener una animación real`).toMatch(/matthias-home-/);

  const transforms = [];
  for (let i = 0; i < 7; i += 1) {
    transforms.push(await shell.evaluate((node) => getComputedStyle(node).transform));
    await page.waitForTimeout(220);
  }
  expect(new Set(transforms).size, `${label}: la transformación debe cambiar con el tiempo`).toBeGreaterThan(2);
}

test('Home · Matthias carga, se mueve de verdad en desktop y móvil y abre Así juegas', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await mockApi(page);
  await login(page);
  await dismissHomeGuide(page);

  const corner = page.getByRole('complementary', { name: 'Rincón de Matthias' });
  await expect(corner).toBeVisible();
  await dismissMatthiasSpeech(corner);

  const matthias = corner.getByRole('button', { name: 'Abrir Así juegas con Matthias', exact: true });
  await expect(matthias).toBeVisible();

  const portrait = matthias.locator('img');
  await expect(portrait).toBeVisible();
  await expect.poll(
    () => portrait.evaluate((img) => img.complete && img.naturalWidth > 0 && img.naturalHeight > 0),
    { message: 'El retrato de Matthias debe haberse decodificado realmente' },
  ).toBe(true);

  await expect(corner).toHaveAttribute('data-placement', 'viewport');
  await expectPortraitMotion(page, matthias.locator('.matthias-resident__portrait-shell'), 'desktop');

  await page.setViewportSize({ width: 390, height: 844 });
  await expect(corner).toHaveAttribute('data-placement', 'inline');
  await expectPortraitMotion(page, matthias.locator('.matthias-resident__portrait-shell'), 'móvil');

  await matthias.click();
  await expect(page.getByRole('heading', { name: 'Así juegas', exact: true })).toBeVisible();
});

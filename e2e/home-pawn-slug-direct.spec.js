import { expect, test } from '@playwright/test';
import { login, mockApi } from './helpers.js';

async function dismissHomeOverlays(page) {
  const guide = page.getByRole('region', { name: 'Guía rápida de Chess Studio' });
  if (await guide.isVisible().catch(() => false)) {
    const dismiss = guide.getByRole('button', { name: 'Ahora no', exact: true });
    const close = guide.getByRole('button', { name: 'Cerrar guía rápida', exact: true });
    if (await dismiss.isVisible().catch(() => false)) await dismiss.click();
    else if (await close.isVisible().catch(() => false)) await close.click();
  }

  const speech = page.getByRole('region', { name: 'Mensaje de Matthias', exact: true });
  if (await speech.isVisible().catch(() => false)) {
    const close = speech.getByRole('button', { name: 'Cerrar comentario de Matthias', exact: true });
    if (await close.isVisible().catch(() => false)) await close.click({ force: true });
  }
}

test('Home abre Pawn Slug Godot directamente sin pasar por el hub de Experimentos', async ({ page }) => {
  await mockApi(page);
  await login(page);
  await dismissHomeOverlays(page);

  // Pawn Slug lives in the Mazmorras panel (the floating Home chip was retired).
  const dungeon = page.getByRole('button', { name: /Más modos y herramientas/ });
  await dungeon.focus();
  await page.keyboard.press('Enter');
  const direct = page.getByRole('button', { name: 'Abrir Pawn Slug directamente', exact: true });
  await expect(direct).toBeVisible();
  await direct.click();

  await expect(page.locator('.pawn-slug-godot-host')).toBeVisible({ timeout: 20_000 });
  await expect(page.getByRole('heading', { name: 'Experimentos geniales', exact: true })).toHaveCount(0);
  await expect(page.locator('iframe[title="Pawn Slug Godot"]')).toBeVisible({ timeout: 20_000 });
});

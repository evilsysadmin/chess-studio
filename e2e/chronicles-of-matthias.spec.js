import { expect, test } from '@playwright/test';
import { confirmChroniclesCharacterSetup, login, mockApi, openMoreGameModes } from './helpers.js';

async function dismissGuide(page) {
  const guide = page.getByRole('region', { name: 'Guía rápida de Chess Studio' });
  if (!(await guide.isVisible().catch(() => false))) return;
  const dismiss = guide.getByRole('button', { name: 'Ahora no', exact: true });
  if (await dismiss.isVisible().catch(() => false)) await dismiss.click();
}

async function openChroniclesSetup(page) {
  await mockApi(page);
  await login(page);
  await dismissGuide(page);
  const moreModes = await openMoreGameModes(page);
  const experiments = moreModes.getByRole('button').filter({ hasText: 'Experimentos geniales' });
  await expect(experiments).toBeVisible();
  await experiments.click();
  const descend = page.getByRole('button').filter({ hasText: 'Descender a la cripta' });
  await expect(descend).toBeVisible();
  await descend.click();
  const setup = page.locator('[data-chronicles-character-setup]');
  await expect(setup).toBeVisible();
  return setup;
}

async function openChronicles(page) {
  await openChroniclesSetup(page);
  await confirmChroniclesCharacterSetup(page);
  await expect(page.getByRole('heading', { name: 'Chronicles of Matthias', exact: true })).toBeVisible();
}

test('Chronicles creator · recupera el borrador tras F5 sin confirmar progreso', async ({ page }) => {
  const setup = await openChroniclesSetup(page);
  await setup.getByRole('button', { name: 'Crear PJs', exact: true }).click();

  const name = page.getByRole('textbox', { name: 'Nombre de matthias', exact: true });
  await name.fill('Greta de la Cripta');
  await page.getByRole('button', { name: 'Subir Vigor', exact: true }).click();
  const azizSlot = page.locator('.chronicles-character-setup__slots button').filter({ hasText: 'Aziz' });
  await azizSlot.click();
  await expect(azizSlot).toHaveAttribute('aria-pressed', 'true');

  await page.reload();

  const restored = page.locator('[data-chronicles-character-setup="editor"]');
  await expect(restored).toBeVisible();
  await expect(restored.getByText('Borrador recuperado de esta sesión.', { exact: true })).toBeVisible();
  const restoredAziz = page.locator('.chronicles-character-setup__slots button').filter({ hasText: 'Aziz' });
  await expect(restoredAziz).toHaveAttribute('aria-pressed', 'true');

  const matthiasSlot = page.locator('.chronicles-character-setup__slots button').filter({ hasText: 'Greta de la Cripta' });
  await matthiasSlot.click();
  await expect(page.getByRole('textbox', { name: 'Nombre de matthias', exact: true })).toHaveValue('Greta de la Cripta');
  await expect(restored.getByText('+1 HP', { exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Chronicles of Matthias', exact: true })).toHaveCount(0);
});

test('Chronicles of Matthias · abre una cripta Three.js real y usa combate posicional de grupo', async ({ page }) => {
  await openChronicles(page);
  const mode = page.locator('[data-chronicles="true"]');
  const stage = mode.locator('[data-chronicles-renderer="three"]');
  await expect(stage.locator('canvas')).toBeVisible({ timeout: 30_000 });
  await expect(mode.getByText('CRÓNICA RPG · BOOK I', { exact: true })).toBeVisible({ timeout: 30_000 });
  await expect(mode.locator('.chronicles-renderer-error')).toHaveCount(0);

  // Use the real keyboard gameplay path for hosted WebGL. Chromium's synthetic
  // pointer action can stall while the software renderer owns the main thread,
  // even though the visible button is enabled and stable.
  const hildegard = mode.getByRole('button', { name: 'Seleccionar Hildegard', exact: true });
  await expect(mode).toHaveAttribute('data-chronicles-turns', '0');
  await page.keyboard.press('2');
  await expect(hildegard).toHaveAttribute('aria-pressed', 'true');

  // Procedural worlds do not promise an authored enemy at one fixed square.
  // Prove the real input/reducer contract instead: movement always consumes a
  // turn (even when blocked), then Hildegard's positional attack consumes the
  // next turn and authors feedback about the selected party member.
  await page.keyboard.press('w');
  await expect(mode).toHaveAttribute('data-chronicles-turns', '1');
  await page.keyboard.press('Space');
  await expect(mode).toHaveAttribute('data-chronicles-turns', '2');
  await expect(hildegard).toHaveAttribute('aria-pressed', 'true');
});

test('Chronicles of Matthias · móvil mantiene party y mandos sin overflow', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openChronicles(page);
  const mode = page.locator('[data-chronicles="true"]');
  await expect(mode.getByLabel('Controles de la mazmorra')).toBeVisible();
  for (const name of ['Girar a la izquierda', 'Avanzar', 'Atacar', 'Retroceder', 'Girar a la derecha']) {
    await expect(mode.getByRole('button', { name, exact: true })).toBeVisible();
  }
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
});

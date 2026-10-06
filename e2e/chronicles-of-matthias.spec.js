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
  await expect(page.locator('[data-chronicles="true"]')).toBeVisible();
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
  await expect(page.locator('[data-chronicles="true"]')).toHaveCount(0);
});

test('Chronicles of Matthias · abre una cripta Three.js real y usa combate posicional de grupo', async ({ page }) => {
  await openChronicles(page);
  const mode = page.locator('[data-chronicles="true"]');
  const stage = mode.locator('[data-chronicles-renderer="three"]');
  await expect(stage.locator('canvas')).toBeVisible({ timeout: 30_000 });
  await expect(mode.locator('summary[aria-label="Abrir menú de Chronicles"]')).toBeVisible({ timeout: 30_000 });
  await expect(mode.locator('.chronicles-renderer-error')).toHaveCount(0);

  // Use the real keyboard gameplay path for hosted WebGL. Chromium's synthetic
  // pointer action can stall while the software renderer owns the main thread,
  // even though the visible button is enabled and stable.
  const hildegard = mode.getByRole('button', { name: 'Seleccionar Hildegard', exact: true });
  await expect(mode).toHaveAttribute('data-chronicles-turns', '0');
  await page.keyboard.press('2');
  await expect(hildegard).toHaveAttribute('aria-pressed', 'true');

  // At the canonical start Hildegard is still one square short of the pawn:
  // prove the keyboard attack path without starting combat yet.
  await page.keyboard.press('Space');
  await expect(mode).toHaveAttribute('data-chronicles-turns', '1');
  await expect(mode).toHaveAttribute('data-chronicles-phase', 'explore');
  await expect(hildegard).toHaveAttribute('aria-pressed', 'true');

  // Advancing one square enters the pawn's engagement radius. The exploration
  // action completes, then Chronicles freezes into the AGI + 1d8 initiative
  // scheduler instead of performing the legacy immediate-retaliation flow.
  await page.keyboard.press('w');
  await expect(mode).toHaveAttribute('data-chronicles-turns', '2');
  await expect(mode).toHaveAttribute('data-chronicles-phase', 'combat');
  await expect(mode).toHaveAttribute('data-chronicles-initiative-die', '1d8');
});

test('Chronicles of Matthias · móvil mantiene party y mandos sin overflow', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openChronicles(page);
  const mode = page.locator('[data-chronicles="true"]');
  const modeBox = await mode.boundingBox();
  expect(modeBox?.x ?? 99).toBeLessThanOrEqual(1);
  expect(modeBox?.y ?? 99).toBeLessThanOrEqual(1);
  expect(modeBox?.width || 0).toBeGreaterThanOrEqual(388);
  expect(modeBox?.height || 0).toBeGreaterThanOrEqual(842);
  expect(await page.evaluate(() => document.fullscreenElement)).toBeNull();
  await expect(mode.getByRole('button', { name: 'Abrir automapa', exact: true })).toBeVisible();
  await expect(mode.getByLabel('Controles de la mazmorra')).toBeVisible();
  for (const name of ['Girar a la izquierda', 'Avanzar', 'Atacar', 'Retroceder', 'Girar a la derecha']) {
    await expect(mode.getByRole('button', { name, exact: true })).toBeVisible();
  }
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
});


test('Chronicles of Matthias · automapa conserva fullscreen, bloquea input y orienta la flecha del grupo', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openChronicles(page);

  const mode = page.locator('[data-chronicles="true"]');
  const mapButton = mode.getByRole('button', { name: 'Abrir automapa', exact: true });
  await expect(mapButton).toBeVisible();
  await mapButton.click();

  const automap = page.getByRole('dialog', { name: 'Automapa de Chronicles', exact: true });
  await expect(automap).toBeVisible();
  const marker = automap.locator('[data-chronicles-map-facing]');
  await expect(marker).toHaveCount(1);
  const initialFacing = Number(await marker.getAttribute('data-chronicles-map-facing'));
  expect(initialFacing).toBeGreaterThanOrEqual(0);
  expect(initialFacing).toBeLessThanOrEqual(3);
  expect(await automap.locator('.chronicles-automap__cell').count()).toBeGreaterThan(0);

  const turnsWhileOpen = Number(await mode.getAttribute('data-chronicles-turns'));
  await page.keyboard.press('w');
  await expect(mode).toHaveAttribute('data-chronicles-turns', String(turnsWhileOpen));

  await page.keyboard.press('Escape');
  await expect(automap).toHaveCount(0);
  await expect(page.locator('.chronicles-game-menu[open]')).toHaveCount(0);

  await page.keyboard.press('d');
  await page.keyboard.press('m');
  await expect(automap).toBeVisible();
  await expect(automap.locator('[data-chronicles-map-facing]')).toHaveAttribute(
    'data-chronicles-map-facing',
    String((initialFacing + 1) % 4),
  );

  const rootBox = await mode.boundingBox();
  expect(rootBox?.width || 0).toBeGreaterThanOrEqual(388);
  expect(rootBox?.height || 0).toBeGreaterThanOrEqual(842);
  expect(await page.evaluate(() => document.fullscreenElement)).toBeNull();

  await page.keyboard.press('Escape');
  await expect(automap).toHaveCount(0);
  await expect(page.locator('.chronicles-game-menu[open]')).toHaveCount(0);
});


test('Chronicles of Matthias · móvil apaisado ocupa el viewport y conserva escenario jugable', async ({ page }) => {
  await page.setViewportSize({ width: 844, height: 390 });

  const setup = await openChroniclesSetup(page);
  const setupBox = await setup.boundingBox();
  expect(setupBox?.x ?? 99).toBeLessThanOrEqual(1);
  expect(setupBox?.y ?? 99).toBeLessThanOrEqual(1);
  expect(setupBox?.width || 0).toBeGreaterThanOrEqual(842);
  expect(setupBox?.height || 0).toBeGreaterThanOrEqual(388);
  await expect(setup.getByRole('button', { name: 'Entrar con grupo canónico', exact: true })).toBeVisible();

  await confirmChroniclesCharacterSetup(page);
  const mode = page.locator('[data-chronicles="true"]');
  await expect(mode).toBeVisible();
  await expect(mode.locator('[data-chronicles-renderer="three"] canvas')).toBeVisible({ timeout: 30_000 });
  await expect(mode.getByLabel('Controles de la mazmorra')).toBeVisible();

  for (const name of ['Girar a la izquierda', 'Avanzar', 'Atacar', 'Retroceder', 'Girar a la derecha']) {
    await expect(mode.getByRole('button', { name, exact: true })).toBeVisible();
  }

  const stageBox = await mode.locator('.chronicles-stage').boundingBox();
  expect(stageBox?.height || 0).toBeGreaterThanOrEqual(388);
  expect(await page.evaluate(() => document.fullscreenElement)).toBeNull();

  const forwardBox = await mode.getByRole('button', { name: 'Avanzar', exact: true }).boundingBox();
  const attackBox = await mode.getByRole('button', { name: 'Atacar', exact: true }).boundingBox();
  const partyBox = await mode.getByRole('button', { name: 'Seleccionar Matthias', exact: true }).boundingBox();
  expect(forwardBox?.width || 0).toBeGreaterThanOrEqual(52);
  expect(forwardBox?.height || 0).toBeGreaterThanOrEqual(52);
  expect(attackBox?.width || 0).toBeGreaterThanOrEqual(72);
  expect(attackBox?.height || 0).toBeGreaterThanOrEqual(72);
  expect(partyBox?.width || 0).toBeGreaterThanOrEqual(44);
  expect(partyBox?.height || 0).toBeGreaterThanOrEqual(44);

  const turnLeft = mode.getByRole('button', { name: 'Girar a la izquierda', exact: true });
  const turnsBeforeHold = Number(await mode.getAttribute('data-chronicles-turns'));
  await turnLeft.dispatchEvent('pointerdown', { pointerId: 17, pointerType: 'touch', button: 0 });
  await page.waitForTimeout(470);
  await turnLeft.dispatchEvent('pointerup', { pointerId: 17, pointerType: 'touch', button: 0 });
  const turnsAfterHold = Number(await mode.getAttribute('data-chronicles-turns'));
  expect(turnsAfterHold - turnsBeforeHold).toBeGreaterThanOrEqual(2);

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
});

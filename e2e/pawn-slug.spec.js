import { expect, test } from '@playwright/test';
import { login, mockApi, openMoreGameModes } from './helpers.js';

async function dismissGuide(page) {
  const guide = page.getByRole('region', { name: 'Guía rápida de Chess Studio' });
  if (!(await guide.isVisible().catch(() => false))) return;

  const dismiss = guide.getByRole('button', { name: 'Ahora no', exact: true });
  if (await dismiss.isVisible().catch(() => false)) {
    await dismiss.click();
    return;
  }

  const close = guide.getByRole('button', { name: 'Cerrar guía rápida', exact: true });
  if (await close.isVisible().catch(() => false)) await close.click();
}

async function dismissMatthiasSpeech(page) {
  const speech = page.getByRole('region', { name: 'Mensaje de Matthias', exact: true });
  if (!(await speech.isVisible().catch(() => false))) return;

  const close = speech.getByRole('button', { name: 'Cerrar comentario de Matthias', exact: true });
  if (await close.isVisible().catch(() => false)) {
    // Home can place another diegetic control above the speech close target on
    // narrow viewports. This helper is test setup, not a hit-target assertion,
    // so dispatch the semantic close action without coupling Pawn Slug smoke to
    // unrelated Home stacking.
    await close.click({ force: true });
  }
}

async function openPawnSlug(page) {
  await mockApi(page);
  await login(page);
  await dismissGuide(page);
  await dismissMatthiasSpeech(page);
  await openMoreGameModes(page);

  const moreModes = page.locator('#illustrated-home-tools');
  await expect(moreModes).toBeVisible();
  const experiments = moreModes
    .getByRole('button')
    .filter({ hasText: 'Experimentos geniales' });
  await experiments.click();
  await expect(page.getByRole('heading', { name: 'Experimentos geniales', exact: true })).toBeVisible();
  await page.getByRole('button', { name: /Pawn Slug/ }).click();
  await expect(page.getByRole('heading', { name: 'Pawn Slug', exact: true })).toBeVisible();
}

async function startPawnSlug(page) {
  await page.getByRole('button', { name: 'INICIAR OPERACIÓN', exact: true }).click();
  await expect(page.getByRole('button', { name: 'INICIAR OPERACIÓN', exact: true })).toHaveCount(0);
  await expect(page.getByText('Dienstpistole', { exact: true })).toBeVisible();
  return page.getByRole('group', { name: 'Seleccionar arma' });
}

test('Pawn Slug · arranca con pistola y arsenal seleccionable sin tocar el ajedrez competitivo', async ({ page }) => {
  await openPawnSlug(page);

  const stage = page.locator('[data-pawn-slug-renderer="three"]');
  await expect(stage).toBeVisible();
  await expect(stage.locator('canvas')).toHaveCount(0);
  await expect(page.getByText('BAUERNSCHLAG', { exact: true })).toBeVisible();
  await expect(page.getByText(/Cero ELO/)).toBeVisible();
  await expect(page.getByRole('button', { name: 'INICIAR OPERACIÓN', exact: true })).toBeVisible();

  const arsenal = await startPawnSlug(page);
  await expect(stage.locator('canvas')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText('OPERACIÓN BAUERNSCHLAG', { exact: true })).toBeVisible();
  await expect(arsenal).toBeVisible();
  await expect(page.locator('.pawn-slug-hud').getByText('Mk I · ∞', { exact: true })).toBeVisible();
  const pistol = arsenal.getByRole('button', { name: /^1\. Dienstpistole$/ });
  await expect(pistol).toHaveAttribute('aria-pressed', 'true');
  await expect(pistol).toHaveAttribute('title', /Dienstpistole · Mk I/);
  await expect(arsenal.getByRole('button', { name: /^2\. MG-42 · no disponible$/ })).toBeDisabled();
  await expect(arsenal.getByRole('button', { name: /^3\. Benelli M3 · no disponible$/ })).toBeDisabled();
  await expect(arsenal.getByRole('button', { name: /^4\. Panzerfaust · no disponible$/ })).toBeDisabled();

  // La salida forma parte del mismo smoke: no hace falta arrancar Three.js y
  // autenticar otra página sólo para volver al hub.
  await page.getByRole('button', { name: '← Experimentos', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Experimentos geniales', exact: true })).toBeVisible();
  const pawnSlugButton = page.getByRole('button', { name: /Pawn Slug/ });
  await expect(pawnSlugButton).toBeVisible();
  await expect(page.getByRole('button', { name: /Pawn Trailblazer/ })).toBeVisible();

  // Reenter once in the same authenticated session. The first Three.js runtime
  // must have cleaned up its RAF/listeners/WebGL host well enough for a fresh
  // runtime to mount, start and leave again without a reload.
  await pawnSlugButton.click();
  await expect(page.getByRole('heading', { name: 'Pawn Slug', exact: true })).toBeVisible();
  const remountedStage = page.locator('[data-pawn-slug-renderer="three"]');
  await expect(remountedStage.locator('canvas')).toHaveCount(0);
  await startPawnSlug(page);
  await expect(remountedStage.locator('canvas')).toHaveCount(1);
  await expect(remountedStage.locator('canvas')).toBeVisible({ timeout: 30_000 });
  await page.getByRole('button', { name: '← Experimentos', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Experimentos geniales', exact: true })).toBeVisible();
  await expect(remountedStage).toHaveCount(0);
});

test('Pawn Slug · ESC abre Settings, persiste remap y conserva el runtime', async ({ page }) => {
  await openPawnSlug(page);
  await startPawnSlug(page);

  const canvas = page.locator('[data-pawn-slug-renderer="three"] canvas');
  await expect(canvas).toBeVisible();

  await page.keyboard.press('Escape');
  const settings = page.getByRole('dialog', { name: 'Pawn Slug Settings' });
  await expect(settings).toBeVisible();
  await expect(canvas).toBeVisible();

  const jumpRemap = settings.getByRole('button', { name: 'Cambiar tecla de Saltar', exact: true });
  await expect(jumpRemap.locator('kbd')).toHaveText('SHIFT IZQ');
  await jumpRemap.click();
  await expect(jumpRemap.locator('kbd')).toHaveText('PULSA…');
  await page.keyboard.press('KeyL');
  await expect(jumpRemap.locator('kbd')).toHaveText('L');

  // Closing and reopening proves the persisted settings are also the active UI source.
  await page.keyboard.press('Escape');
  await expect(settings).toHaveCount(0);
  await expect(canvas).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(settings).toBeVisible();
  await expect(settings.getByRole('button', { name: 'Cambiar tecla de Saltar', exact: true }).locator('kbd')).toHaveText('L');

  // Leave the shared browser state deterministic for any later smoke work.
  await settings.getByRole('button', { name: 'Restaurar defaults', exact: true }).click();
  await expect(settings.getByRole('button', { name: 'Cambiar tecla de Saltar', exact: true }).locator('kbd')).toHaveText('SHIFT IZQ');

  // The handler still works after remapping and reset: close and reopen once more without remount.
  await page.keyboard.press('Escape');
  await expect(settings).toHaveCount(0);
  await expect(canvas).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog', { name: 'Pawn Slug Settings' })).toBeVisible();
});

test('Pawn Slug · móvil expone controles táctiles y arsenal sin overflow horizontal', async ({ page }) => {
  // Premium sprite generation is intentionally retained on mobile. This smoke
  // validates the finished runtime rather than treating a heavier startup as a
  // hang; keep the extra budget local to this high-cost path.
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 390, height: 844 });
  await openPawnSlug(page);
  const arsenal = await startPawnSlug(page);

  await expect(arsenal).toBeVisible({ timeout: 30_000 });
  await expect(arsenal.getByRole('button', { name: /^1\. Dienstpistole$/ })).toBeVisible({ timeout: 30_000 });

  const controls = page.getByLabel('Controles táctiles de Pawn Slug');
  await expect(controls).toBeVisible({ timeout: 30_000 });
  for (const name of ['Izquierda', 'Derecha', 'Agacharse', 'Saltar', 'Disparar', 'Power-up']) {
    const button = page.getByRole('button', { name, exact: true });
    await expect(button).toBeVisible({ timeout: 30_000 });
    const box = await button.boundingBox();
    expect(box).not.toBeNull();
    expect(box.height).toBeGreaterThanOrEqual(50);
  }

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
});

test('Pawn Slug · Android landscape usa gestos y conserva targets jugables en pantallas cortas', async ({ browser }) => {
  test.setTimeout(90_000);
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    isMobile: true,
  });
  const page = await context.newPage();
  try {
    await openPawnSlug(page);
    await startPawnSlug(page);

    const cabinet = page.locator('.pawn-slug-cabinet');
    const gestureSurface = page.getByRole('group', { name: 'Controles gestuales de Pawn Slug' });
    const powerUp = page.getByRole('button', { name: 'Power-up', exact: true });

    for (const viewport of [
      { width: 844, height: 390 },
      { width: 667, height: 375 },
      { width: 568, height: 320 },
    ]) {
      await page.setViewportSize(viewport);

      await expect(cabinet).toBeVisible({ timeout: 30_000 });
      const cabinetBox = await cabinet.boundingBox();
      expect(cabinetBox).not.toBeNull();
      expect(cabinetBox.y).toBeGreaterThanOrEqual(-1);
      expect(cabinetBox.y + cabinetBox.height).toBeLessThanOrEqual(viewport.height + 1);

      await expect(gestureSurface).toBeVisible({ timeout: 30_000 });
      const gestureBox = await gestureSurface.boundingBox();
      expect(gestureBox).not.toBeNull();
      expect(gestureBox.y).toBeGreaterThanOrEqual(-1);
      expect(gestureBox.y + gestureBox.height).toBeLessThanOrEqual(viewport.height + 1);

      for (const name of ['Izquierda', 'Derecha', 'Agacharse', 'Saltar', 'Disparar']) {
        await expect(page.getByRole('button', { name, exact: true })).not.toBeVisible();
      }

      await expect(powerUp).toBeVisible();
      const powerBox = await powerUp.boundingBox();
      expect(powerBox).not.toBeNull();
      expect(powerBox.width).toBeGreaterThanOrEqual(44);
      expect(powerBox.height).toBeGreaterThanOrEqual(44);
      expect(powerBox.x).toBeGreaterThanOrEqual(-1);
      expect(powerBox.x + powerBox.width).toBeLessThanOrEqual(viewport.width + 1);
      expect(powerBox.y + powerBox.height).toBeLessThanOrEqual(viewport.height + 1);

      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow).toBeLessThanOrEqual(1);
    }
  } finally {
    await context.close();
  }
});

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
  if (await close.isVisible().catch(() => false)) await close.click();
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
  await expect(stage.locator('canvas')).toBeVisible();
  await expect(page.getByText('BAUERNSCHLAG', { exact: true })).toBeVisible();
  await expect(page.getByText(/Cero ELO/)).toBeVisible();
  await expect(page.getByRole('button', { name: 'INICIAR OPERACIÓN', exact: true })).toBeVisible();

  const arsenal = await startPawnSlug(page);
  await expect(page.getByText('OPERACIÓN BAUERNSCHLAG', { exact: true })).toBeVisible();
  await expect(arsenal).toBeVisible();
  await expect(page.locator('.pawn-slug-hud').getByText('Mk I · ∞', { exact: true })).toBeVisible();
  const pistol = arsenal.getByRole('button', { name: /^1\. Dienstpistole$/ });
  await expect(pistol).toHaveAttribute('aria-pressed', 'true');
  await expect(pistol).toHaveAttribute('title', /Dienstpistole · Mk I/);
  await expect(arsenal.getByRole('button', { name: /^2\. MG-42 de bolsillo · no disponible$/ })).toBeDisabled();
  await expect(arsenal.getByRole('button', { name: /^3\. Escopeta diplomática · no disponible$/ })).toBeDisabled();
  await expect(arsenal.getByRole('button', { name: /^4\. Panzerfaust · no disponible$/ })).toBeDisabled();

  // La salida forma parte del mismo smoke: no hace falta arrancar Three.js y
  // autenticar otra página sólo para volver al hub.
  await page.getByRole('button', { name: '← Experimentos', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Experimentos geniales', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: /Pawn Slug/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /Pawn Trailblazer/ })).toBeVisible();
});

test('Pawn Slug · ESC abre Settings, pausa la misión y reanuda sin perder el runtime', async ({ page }) => {
  await openPawnSlug(page);
  await startPawnSlug(page);

  const time = page.locator('.pawn-slug-hud > div').filter({ hasText: 'TIEMPO' }).locator('b');
  await expect(time).not.toHaveText('00:00', { timeout: 3000 });

  await page.keyboard.press('Escape');
  const settings = page.getByRole('dialog', { name: 'Pawn Slug Settings' });
  await expect(settings).toBeVisible();

  const frozenTime = await time.textContent();
  expect(frozenTime).toBeTruthy();
  await page.waitForTimeout(1300);
  await expect(time).toHaveText(frozenTime);

  await page.keyboard.press('Escape');
  await expect(settings).toHaveCount(0);
  await expect(time).not.toHaveText(frozenTime, { timeout: 3000 });
  await expect(page.locator('[data-pawn-slug-renderer="three"] canvas')).toBeVisible();
});

test('Pawn Slug · móvil expone controles táctiles y arsenal sin overflow horizontal', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openPawnSlug(page);
  const arsenal = await startPawnSlug(page);

  await expect(arsenal).toBeVisible();
  await expect(arsenal.getByRole('button', { name: /^1\. Dienstpistole$/ })).toBeVisible();

  const controls = page.getByLabel('Controles táctiles de Pawn Slug');
  await expect(controls).toBeVisible();
  for (const name of ['Izquierda', 'Derecha', 'Agacharse', 'Saltar', 'Disparar', 'Power-up']) {
    const button = page.getByRole('button', { name, exact: true });
    await expect(button).toBeVisible();
    const box = await button.boundingBox();
    expect(box).not.toBeNull();
    expect(box.height).toBeGreaterThanOrEqual(50);
  }

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
});

import { expect, test } from '@playwright/test';
import { login, mockApi } from './helpers.js';

async function dismissGuide(page) {
  const guide = page.getByRole('region', { name: 'Guía rápida de Chess Studio' });
  if (await guide.isVisible().catch(() => false)) {
    await guide.getByRole('button', { name: 'Ahora no', exact: true }).click();
  }
}

async function openPawnSlug(page) {
  await mockApi(page);
  await login(page);
  await dismissGuide(page);
  const moreModes = page.locator('details.home-more-modes');
  if (!(await moreModes.evaluate((node) => node.open))) {
    await moreModes.getByText('Más modos de juego', { exact: true }).click();
  }
  const experiments = moreModes
    .locator('.friendly-disclosure-body > .menu-card-shell > button')
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
  await expect(arsenal.getByRole('button', { name: /^1\. Dienstpistole$/ })).toHaveAttribute('aria-pressed', 'true');
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

test('Pawn Slug · la pistola dispara tiro a tiro aunque se mantenga pulsado el gatillo', async ({ page }) => {
  await openPawnSlug(page);
  await startPawnSlug(page);

  const points = page.locator('.pawn-slug-hud > div').filter({ hasText: 'PUNTOS' }).locator('b');
  await expect(points).toHaveText('0');

  // El primer peón tiene 34 HP y la pistola hace 22 por tiro. Si mantener Z
  // volviese a disparar automáticamente, durante esta espera moriría y habría puntos.
  await page.keyboard.down('z');
  await page.waitForTimeout(1100);
  await page.keyboard.up('z');
  await expect(points).toHaveText('0');

  // Una nueva pulsación sí consume el segundo tiro y remata al primer peón.
  await page.keyboard.press('z');
  await expect(points).not.toHaveText('0', { timeout: 2500 });
});

test('Pawn Slug · móvil expone controles táctiles y arsenal sin overflow horizontal', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openPawnSlug(page);
  const arsenal = await startPawnSlug(page);

  await expect(arsenal).toBeVisible();
  await expect(arsenal.getByRole('button', { name: /^1\. Dienstpistole$/ })).toBeVisible();

  const controls = page.getByLabel('Controles táctiles de Pawn Slug');
  await expect(controls).toBeVisible();
  for (const name of ['Izquierda', 'Derecha', 'Agacharse', 'Saltar', 'Disparar', 'Granada']) {
    const button = page.getByRole('button', { name, exact: true });
    await expect(button).toBeVisible();
    const box = await button.boundingBox();
    expect(box).not.toBeNull();
    expect(box.height).toBeGreaterThanOrEqual(50);
  }

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
});

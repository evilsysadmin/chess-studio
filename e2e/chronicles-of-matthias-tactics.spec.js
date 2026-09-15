import { expect, test } from '@playwright/test';
import { login, mockApi, openMoreGameModes } from './helpers.js';

async function dismissGuide(page) {
  const guide = page.getByRole('region', { name: 'Guía rápida de Chess Studio' });
  if (!(await guide.isVisible().catch(() => false))) return;
  const dismiss = guide.getByRole('button', { name: 'Ahora no', exact: true });
  if (await dismiss.isVisible().catch(() => false)) await dismiss.click();
}

async function openTactics(page) {
  await mockApi(page);
  await login(page);
  await dismissGuide(page);
  const moreModes = await openMoreGameModes(page);
  await moreModes.getByRole('button').filter({ hasText: 'Experimentos geniales' }).click();
  await expect(page.getByRole('heading', { name: 'Experimentos geniales', exact: true })).toBeVisible();
  await page.getByRole('button').filter({ hasText: 'Abrir la mesa táctica' }).click();
  await expect(page.getByRole('heading', { name: 'Chronicles of Matthias Tactics', exact: true })).toBeVisible();
}

test('Chronicles Tactics · arranca Three.js y completa un turno táctico', async ({ page }) => {
  await openTactics(page);
  const mode = page.locator('[data-chronicles-tactics="true"]');
  const canvas = mode.locator('[data-chronicles-tactics-renderer="three"] canvas');
  await expect(canvas).toBeVisible({ timeout: 30_000 });

  await mode.getByRole('button').filter({ hasText: '3. Aziz' }).click();
  await mode.getByRole('button', { name: 'Atacar', exact: true }).click();
  await expect(mode).toHaveAttribute('data-action-mode', 'attack');

  const targets = mode.getByRole('group', { name: /Objetivos de Aziz/ });
  await expect(targets).toBeVisible();
  await targets.getByRole('button').first().click();

  await expect(mode).toHaveAttribute('data-action-mode', 'idle');
  await expect(mode.getByText('RONDA 2', { exact: true })).toBeVisible();
  await expect(mode.getByText(/Aziz usa rayo diagonal/i)).toBeVisible();
});

test('Chronicles Tactics · móvil conserva canvas y controles sin overflow', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openTactics(page);
  const mode = page.locator('[data-chronicles-tactics="true"]');
  await expect(mode.locator('[data-chronicles-tactics-renderer="three"] canvas')).toBeVisible({ timeout: 30_000 });
  await expect(mode.getByRole('button', { name: 'Mover', exact: true })).toBeVisible();
  await expect(mode.getByRole('button', { name: 'Esperar', exact: true })).toBeVisible();

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
});

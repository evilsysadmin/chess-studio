import { expect, test } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { login, mockApi } from './helpers.js';

const ARTIFACT_DIR = '../.artifacts/app-visual';

test.use({ viewport: { width: 1440, height: 900 } });

async function settle(page) {
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  await page.waitForTimeout(120);
}

async function assertNoHorizontalOverflow(page, label) {
  const overflow = await page.evaluate(() => {
    const root = document.documentElement;
    return {
      clientWidth: root.clientWidth,
      scrollWidth: root.scrollWidth,
    };
  });
  expect(overflow.scrollWidth, `${label}: horizontal overflow`).toBeLessThanOrEqual(overflow.clientWidth + 1);
}

async function assertSpecialModesDensity(shell) {
  const density = await shell.locator('.mechanic-library').evaluate((root) => {
    const list = root.querySelector('.mechanic-library-list')?.getBoundingClientRect();
    const detail = root.querySelector('.mechanic-library-detail')?.getBoundingClientRect();
    return {
      listHeight: list?.height || 0,
      detailHeight: detail?.height || 0,
    };
  });

  expect(density.detailHeight, 'special modes: detail should size to its lesson, not the rail').toBeLessThanOrEqual(480);
  expect(density.detailHeight, 'special modes: detail should remain visibly shorter than the scroll rail').toBeLessThan(density.listHeight - 40);
}

async function captureAt(page, label, { width = 1440, height = 900, variant = 'desktop' } = {}) {
  await page.setViewportSize({ width, height });
  await settle(page);
  await assertNoHorizontalOverflow(page, `${label}-${variant}`);
  await page.screenshot({
    path: `${ARTIFACT_DIR}/training-${label}-${variant}-${width}x${height}.png`,
    fullPage: false,
    animations: 'disabled',
  });
}

async function capture(page, label) {
  await captureAt(page, label);
}

test('Entrenar · captura visual de Escuela, Mi progreso, Modos especiales y Aperturas', async ({ page }) => {
  await mkdir(ARTIFACT_DIR, { recursive: true });
  await mockApi(page, {
    profileSeed: {
      'matthias.onboarded': '2',
      'chess-study-home-guide-dismissed-v1': '1',
    },
  });
  await login(page);

  const train = page.locator('.illustrated-home__destination--train');
  await expect(train).toBeVisible();
  await train.click();

  const shell = page.locator('.tutorial-shell.matthias-school-shell');
  await expect(shell).toBeVisible();
  await expect(shell.locator('.matthias-school-stage')).toBeVisible();
  await capture(page, 'school');

  await shell.getByRole('button', { name: 'Glosario' }).click();
  await expect(shell.locator('.chess-glossary')).toBeVisible();
  await capture(page, 'glossary');

  await shell.getByRole('button', { name: 'Modos especiales' }).click();
  await expect(shell.locator('.mechanic-library')).toBeVisible();
  await settle(page);
  await assertSpecialModesDensity(shell);
  await capture(page, 'special-modes');

  await page.getByRole('button', { name: '← Volver a la Escuela', exact: true }).click();
  await page.getByRole('button', { name: '← Volver al menú', exact: true }).click();
  await expect(page.locator('.illustrated-home')).toBeVisible();

  await page.getByRole('button', { name: 'Abrir Así juegas con Matthias', exact: true }).click();
  const insights = page.locator('.insights-coach-workspace');
  await expect(insights).toBeVisible();
  await expect(insights.getByRole('heading', { name: 'Así juegas', exact: true })).toBeVisible();
  await insights.getByRole('tab', { name: 'Mi progreso', exact: true }).click();

  const career = page.locator('.career-screen');
  await expect(career).toBeVisible();
  await expect(career.locator('.career-hero-grid').first()).toBeVisible();
  await capture(page, 'career-summary');
  await captureAt(page, 'career-summary', { width: 390, height: 844, variant: 'mobile' });
  await expect(page.locator('.masthead:not(.masthead-game-compact) .masthead-text')).toBeHidden();

  await page.setViewportSize({ width: 1440, height: 900 });
  await career.getByRole('button', { name: 'Rendimiento', exact: true }).click();
  await expect(career.getByRole('button', { name: 'Rendimiento', exact: true })).toHaveClass(/active/);
  await expect(career.locator('.career-hero-grid').first()).toBeVisible();
  await capture(page, 'career-performance');

  await page.getByRole('button', { name: '← Volver al menú', exact: true }).click();
  await expect(page.locator('.illustrated-home')).toBeVisible();
  await page.getByRole('button', { name: 'Más modos y herramientas · Mazmorras', exact: true }).click();
  await page.getByRole('button', { name: 'Aperturas', exact: true }).click();

  const openings = page.locator('.openings-library-screen');
  await expect(openings).toBeVisible();
  await expect(openings.getByRole('heading', { name: 'Aperturas famosas', exact: true })).toBeVisible();
  await expect(openings.locator('.openings-volume').first()).toBeVisible();
  await capture(page, 'openings');
  await captureAt(page, 'openings', { width: 390, height: 844, variant: 'mobile' });
  await expect(page.locator('.masthead:not(.masthead-game-compact) .masthead-text')).toBeHidden();
});
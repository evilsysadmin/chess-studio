import { expect, test } from '@playwright/test';
import { login, mockApi } from './helpers.js';

test('Así juegas móvil · navegación completa sin carrusel horizontal', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await mockApi(page);
  await login(page);

  await page.locator('.illustrated-home__matthias').click();
  const workspace = page.locator('.insights-coach-workspace');
  await expect(workspace).toBeVisible();

  for (const width of [360, 390, 430]) {
    await page.setViewportSize({ width, height: 844 });

    const primaryTabs = workspace.locator('.insights-workspace-primary-tabs > button');
    await expect(primaryTabs).toHaveCount(2);
    for (let index = 0; index < 2; index += 1) {
      const box = await primaryTabs.nth(index).boundingBox();
      expect(box).not.toBeNull();
      expect(box.height).toBeGreaterThanOrEqual(44);
    }

    const nav = workspace.locator('.insights-workspace-nav');
    const diagnosisTabs = nav.locator('> button');
    await expect(diagnosisTabs).toHaveCount(3);

    const navMetrics = await nav.evaluate((node) => ({
      scrollWidth: node.scrollWidth,
      clientWidth: node.clientWidth,
    }));
    expect(navMetrics.scrollWidth).toBeLessThanOrEqual(navMetrics.clientWidth + 1);

    const boxes = [];
    for (let index = 0; index < 3; index += 1) {
      const box = await diagnosisTabs.nth(index).boundingBox();
      expect(box).not.toBeNull();
      expect(box.height).toBeGreaterThanOrEqual(48);
      boxes.push(box);
    }
    expect(Math.max(...boxes.map((box) => box.y)) - Math.min(...boxes.map((box) => box.y))).toBeLessThanOrEqual(2);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
  }
});

const LAYOUT_HISTORY = Array.from({ length: 4 }, (_, index) => ({
  id: `layout-${index}`,
  sourceGameId: `layout-${index}`,
  date: new Date(Date.UTC(2026, 8, 20 + index)).toISOString(),
  outcome: index % 2 ? 'loss' : 'win',
  mode: 'casual',
  difficulty: 10,
  humanColor: 'w',
  moves: ['e4', 'e5', 'Nf3', 'Nc6'],
  captured: [],
}));

test('Así juegas escritorio · el estado vacío «Diagnóstico» ocupa todo el ancho de la rejilla', async ({ page }) => {
  // Antes caía en una sola columna de la rejilla de 12 (~97 px dentro de 1380 px).
  await page.setViewportSize({ width: 1440, height: 900 });
  await mockApi(page);
  await login(page);
  await page.locator('.illustrated-home__matthias').click();
  const hub = page.locator('.insights-coach-workspace .insights-hub');
  const diagnosis = hub.locator('> .menu-section').filter({ has: page.getByRole('heading', { name: 'Diagnóstico', exact: true }) });
  await expect(diagnosis).toBeVisible();
  const [hubBox, diagnosisBox] = await Promise.all([hub.boundingBox(), diagnosis.boundingBox()]);
  expect(diagnosisBox.width).toBeGreaterThan(hubBox.width * 0.9);
});

for (const viewport of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
  test(`Así juegas ${viewport.width}px · la etiqueta del veredicto no se recorta contra el borde`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await mockApi(page, { profileSeed: { 'chess-study-game-history': JSON.stringify(LAYOUT_HISTORY) } });
    await login(page);
    await page.locator('.illustrated-home__matthias').click();
    const portrait = page.locator('.insights-coach-workspace .ai-player-portrait');
    await expect(portrait).toBeVisible();
    const eyebrow = portrait.locator('.section-label').first();
    const [portraitBox, eyebrowBox] = await Promise.all([portrait.boundingBox(), eyebrow.boundingBox()]);
    expect(eyebrowBox.x - portraitBox.x).toBeGreaterThanOrEqual(8);
  });
}

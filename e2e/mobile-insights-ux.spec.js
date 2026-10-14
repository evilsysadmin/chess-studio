import { expect, test } from '@playwright/test';
import { login, mockApi } from './helpers.js';

test('Así juegas móvil · archivo secundario sin doble fila de tabs ni overflow', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await mockApi(page);
  await login(page);

  await page.locator('.illustrated-home__matthias').click();
  const workspace = page.locator('.insights-coach-workspace');
  await expect(workspace).toBeVisible();

  for (const width of [360, 390, 430]) {
    await page.setViewportSize({ width, height: 844 });

    await expect(workspace.locator('.insights-workspace-primary-tabs')).toHaveCount(0);
    await expect(workspace.locator('.insights-workspace-nav')).toHaveCount(0);

    const tools = workspace.locator('.insights-room-tools > button');
    await expect(tools).toHaveCount(3);
    for (let index = 0; index < 3; index += 1) {
      const box = await tools.nth(index).boundingBox();
      expect(box).not.toBeNull();
      expect(box.height).toBeGreaterThanOrEqual(44);
    }

    const metrics = await workspace.locator('.insights-room-tools').evaluate((node) => ({
      scrollWidth: node.scrollWidth,
      clientWidth: node.clientWidth,
    }));
    expect(metrics.scrollWidth).toBeLessThanOrEqual(metrics.clientWidth + 1);
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

test('Así juegas escritorio · la tarea de Matthias ocupa el ancho útil de la mesa', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await mockApi(page);
  await login(page);
  await page.locator('.illustrated-home__matthias').click();

  const panel = page.locator('.insights-coach-workspace .insights-workspace-panel');
  const task = panel.locator('.insights-guided-session');
  await expect(task).toBeVisible();
  const [panelBox, taskBox] = await Promise.all([panel.boundingBox(), task.boundingBox()]);
  expect(taskBox.width).toBeGreaterThan(panelBox.width * 0.86);
});

for (const viewport of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
  test(`Así juegas ${viewport.width}px · la etiqueta del veredicto no se recorta contra el borde`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await mockApi(page, { profileSeed: { 'chess-study-game-history': JSON.stringify(LAYOUT_HISTORY) } });
    await login(page);
    await page.locator('.illustrated-home__matthias').click();
    await page.getByRole('button', { name: 'Expediente', exact: true }).click();
    const portrait = page.locator('.insights-coach-workspace .ai-player-portrait');
    await expect(portrait).toBeVisible();
    const eyebrow = portrait.locator('.section-label').first();
    const [portraitBox, eyebrowBox] = await Promise.all([portrait.boundingBox(), eyebrow.boundingBox()]);
    expect(eyebrowBox.x - portraitBox.x).toBeGreaterThanOrEqual(8);
  });
}

test('Así juegas móvil · archivo despejado de la radio tras navegar a Errores', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await mockApi(page);
  await login(page);

  const player = page.locator('.global-music-dock .music-deck-collapsed');
  await expect(player).toBeVisible();
  await page.locator('.illustrated-home__matthias').click();
  const workspace = page.locator('.insights-coach-workspace');
  const archive = workspace.locator('details[data-insights-archive]');
  if (await archive.getAttribute('open') === null) {
    await archive.locator(':scope > summary').click();
  }

  await archive.getByRole('button', { name: 'Errores', exact: true }).click();
  const panel = workspace.getByRole('region', { name: 'Errores recurrentes' });
  await expect(panel).toBeFocused();

  // The radio stays fixed near the upper-right corner. The tabs must remain
  // reachable when the archive panel scrolls into view after a real tap.
  const progressTab = archive.getByRole('button', { name: 'Mi progreso', exact: true });
  await expect.poll(async () => {
    const [tab, dock] = await Promise.all([progressTab.boundingBox(), player.boundingBox()]);
    if (!tab || !dock) return false;
    const separated = tab.y >= dock.y + dock.height + 4 ||
      tab.x + tab.width <= dock.x - 4 ||
      tab.x >= dock.x + dock.width + 4;
    return separated && tab.y >= 0 && tab.y + tab.height <= 844;
  }, { message: 'Mi progreso must stay clear of the floating radio after archive navigation' }).toBe(true);
  await progressTab.click();
  await expect(workspace.getByRole('region', { name: 'Mi progreso' })).toBeFocused();
});

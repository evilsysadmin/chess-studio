import { expect, test } from '@playwright/test';
import { login, mockApi, openCampaignMap } from './helpers.js';

test('Combat Chess · Campaña permite jugar con defaults · Mercado táctico usable en móvil', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await mockApi(page);
  await login(page);
  await openCampaignMap(page);

  await page.getByRole('button', { name: /Mercado/ }).click();
  const market = page.getByRole('dialog', { name: 'Mercado táctico' });
  await expect(market).toBeVisible();

  const mercenaries = market.getByRole('tab', { name: 'Mercenarios', exact: true });
  const equipment = market.getByRole('tab', { name: 'Armas y equipo', exact: true });
  await expect(mercenaries).toHaveAttribute('aria-selected', 'true');

  for (const width of [360, 390, 430]) {
    await test.step(`Mercenarios ${width}px`, async () => {
      await page.setViewportSize({ width, height: 844 });
      await expect(market).toBeVisible();
      await expect(mercenaries).toBeVisible();
      await expect(equipment).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
    });
  }

  await equipment.click();
  await expect(equipment).toHaveAttribute('aria-selected', 'true');
  await expect(market.getByLabel('Asignar a').first()).toBeVisible();

  for (const width of [360, 390, 430]) {
    await test.step(`Equipo ${width}px`, async () => {
      await page.setViewportSize({ width, height: 844 });
      await expect(market.getByLabel('Asignar a').first()).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
    });
  }

  await market.getByRole('button', { name: 'Cerrar mercado', exact: true }).click();
  await expect(market).toHaveCount(0);
});

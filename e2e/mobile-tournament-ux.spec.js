import { expect, test } from '@playwright/test';
import { login, mockApi } from './helpers.js';

test('Torneo móvil · la siguiente partida domina el primer viewport y es táctil', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await mockApi(page);
  await login(page);

  await page.locator('.illustrated-home__destination--tournament').click();
  const tournament = page.locator('.tournament-panel');
  await expect(tournament).toBeVisible();

  for (const width of [360, 390, 430]) {
    await page.setViewportSize({ width, height: 844 });

    const play = tournament.getByRole('button', { name: 'Jugar siguiente partida', exact: true });
    await expect(play).toBeVisible();
    const playBox = await play.boundingBox();
    expect(playBox).not.toBeNull();
    expect(playBox.height).toBeGreaterThanOrEqual(52);
    expect(playBox.y + playBox.height).toBeLessThanOrEqual(844);

    const colorSummary = tournament.locator('.tournament-color-choice > summary');
    const moreSummary = tournament.locator('.tournament-more > summary');
    for (const control of [colorSummary, moreSummary]) {
      const box = await control.boundingBox();
      expect(box).not.toBeNull();
      expect(box.height).toBeGreaterThanOrEqual(44);
    }

    const backBox = await tournament.locator('> .back-link').boundingBox();
    expect(backBox).not.toBeNull();
    expect(backBox.height).toBeGreaterThanOrEqual(44);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
  }
});

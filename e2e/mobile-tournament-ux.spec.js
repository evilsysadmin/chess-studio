import { expect, test } from '@playwright/test';
import { login, mockApi } from './helpers.js';

async function expectTouchTarget(locator) {
  await locator.scrollIntoViewIfNeeded();
  await expect(locator).toBeVisible();
  const box = await locator.boundingBox();
  expect(box).not.toBeNull();
  expect(box.height).toBeGreaterThanOrEqual(44);
}


test('Torneo móvil · la siguiente partida domina el primer viewport y es táctil', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await mockApi(page);
  await login(page);

  await page.locator('.illustrated-home__destination--tournament').click();
  const tournament = page.locator('.tournament-panel');
  await expect(tournament).toBeVisible();

  const play = tournament.getByRole('button', { name: 'Jugar siguiente partida', exact: true });
  const colorDetails = tournament.locator('.tournament-color-choice');
  const colorSummary = colorDetails.locator(':scope > summary');
  const moreDetails = tournament.locator('.tournament-more');
  const moreSummary = moreDetails.locator(':scope > summary');

  for (const width of [360, 390, 430]) {
    await page.setViewportSize({ width, height: 844 });

    await expect(play).toBeVisible();
    const playBox = await play.boundingBox();
    expect(playBox).not.toBeNull();
    expect(playBox.height).toBeGreaterThanOrEqual(52);
    expect(playBox.y + playBox.height).toBeLessThanOrEqual(844);
    await expectTouchTarget(colorSummary);
    await expectTouchTarget(moreSummary);
    await expectTouchTarget(tournament.locator('> .back-link'));
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
  }

  await colorSummary.click();
  const colors = colorDetails.getByRole('radiogroup', { name: 'Elegir color' }).getByRole('radio');
  await expect(colors).toHaveCount(3);
  for (const width of [360, 390, 430]) {
    await page.setViewportSize({ width, height: 844 });
    for (let index = 0; index < 3; index += 1) await expectTouchTarget(colors.nth(index));
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
  }

  await moreSummary.click();
  const history = tournament.getByRole('button', { name: 'Ver historial de partidas', exact: true });
  const unlockedReward = tournament.locator('.reward-chip:not(:disabled)').first();
  const dangerDetails = tournament.locator('.danger-disclosure');
  const dangerSummary = dangerDetails.locator(':scope > summary');
  for (const width of [360, 390, 430]) {
    await page.setViewportSize({ width, height: 844 });
    await expectTouchTarget(history);
    await expectTouchTarget(unlockedReward);
    await expectTouchTarget(dangerSummary);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
  }

  await dangerSummary.click();
  const reset = tournament.getByRole('button', { name: 'Reiniciar progreso', exact: true });
  for (const width of [360, 390, 430]) {
    await page.setViewportSize({ width, height: 844 });
    await expectTouchTarget(reset);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
  }
});

import { expect, test } from '@playwright/test';
import { login, mockApi } from './helpers.js';

async function openHome(page) {
  await mockApi(page, {
    profileSeed: {
      'matthias.onboarded': '2',
      'chess-study-home-guide-dismissed-v1': '1',
    },
  });
  await login(page);
  const home = page.getByRole('region', { name: 'Modos principales' });
  await expect(home).toBeVisible();
  return home;
}

for (const viewport of [
  { width: 390, height: 844, label: '390x844' },
  { width: 360, height: 740, label: '360x740' },
]) {
  test(`Home Android · composición compacta ${viewport.label}`, async ({ page }) => {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    const home = await openHome(page);

    const selectors = {
      tournament: '.illustrated-home__destination--tournament',
      train: '.illustrated-home__destination--train',
      combat: '.illustrated-home__destination--combat',
      daily: '.illustrated-home__destination--daily',
      play: '.illustrated-home__destination--play',
      history: '.illustrated-home__destination--history',
      matthias: '.illustrated-home__matthias',
      utilities: '.illustrated-home__utilities',
    };

    const boxes = {};
    for (const [name, selector] of Object.entries(selectors)) {
      const locator = home.locator(selector);
      await expect(locator).toBeVisible();
      boxes[name] = await locator.boundingBox();
      expect(boxes[name]).not.toBeNull();
    }

    const firstRowBottom = Math.max(
      boxes.tournament.y + boxes.tournament.height,
      boxes.train.y + boxes.train.height,
    );
    const secondRowTop = Math.min(boxes.combat.y, boxes.daily.y);
    const secondRowBottom = Math.max(
      boxes.combat.y + boxes.combat.height,
      boxes.daily.y + boxes.daily.height,
    );

    expect(secondRowTop).toBeGreaterThanOrEqual(firstRowBottom - 3);
    expect(boxes.play.y).toBeGreaterThan(secondRowBottom + 8);
    expect(boxes.play.y + boxes.play.height).toBeLessThan(viewport.height * 0.58);
    expect(boxes.history.y).toBeGreaterThan(boxes.play.y);
    expect(boxes.matthias.y).toBeGreaterThan(boxes.history.y);
    expect(boxes.utilities.y).toBeGreaterThan(boxes.play.y);

    for (const box of Object.values(boxes)) {
      expect(box.x).toBeGreaterThanOrEqual(-1);
      expect(box.x + box.width).toBeLessThanOrEqual(viewport.width + 1);
      expect(box.y).toBeGreaterThanOrEqual(-1);
      expect(box.y + box.height).toBeLessThanOrEqual(viewport.height + 1);
    }

    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  });
}

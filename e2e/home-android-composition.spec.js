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
  { width: 430, height: 932, label: '430x932' },
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

    const account = page.locator('.masthead-account-trigger');
    const feedback = page.locator('.masthead-feedback-trigger');
    const releases = page.locator('.masthead-release-trigger');
    await expect(account).toBeVisible();
    await expect(feedback).toBeVisible();
    await expect(releases).toBeVisible();

    const [accountBox, feedbackBox, releaseBox] = await Promise.all([
      account.boundingBox(),
      feedback.boundingBox(),
      releases.boundingBox(),
    ]);
    expect(accountBox).not.toBeNull();
    expect(feedbackBox).not.toBeNull();
    expect(releaseBox).not.toBeNull();

    const accountCenter = accountBox.x + accountBox.width / 2;
    expect(Math.abs(accountCenter - viewport.width / 2)).toBeLessThanOrEqual(3);

    for (const [label, box] of [
      ['account', accountBox],
      ['feedback', feedbackBox],
      ['releases', releaseBox],
    ]) {
      expect(box.width, `${label}: touch width`).toBeGreaterThanOrEqual(44);
      expect(box.height, `${label}: touch height`).toBeGreaterThanOrEqual(44);
      expect(box.width, `${label}: chrome stays compact`).toBeLessThanOrEqual(48);
      expect(box.height, `${label}: chrome stays compact`).toBeLessThanOrEqual(48);
    }

    const homeTargets = [
      ...Object.entries(selectors)
        .filter(([name]) => name !== 'utilities')
        .map(([name, selector]) => [name, home.locator(selector)]),
      ['dungeon', home.locator('.illustrated-home__dungeon-trigger')],
    ];
    for (const [label, target] of homeTargets) {
      const box = await target.boundingBox();
      expect(box, `${label}: touch box`).not.toBeNull();
      expect(box.width, `${label}: touch width`).toBeGreaterThanOrEqual(44);
      expect(box.height, `${label}: touch height`).toBeGreaterThanOrEqual(44);
    }

    expect(releaseBox.x + releaseBox.width).toBeLessThanOrEqual(feedbackBox.x + 1);
    expect(feedbackBox.x + feedbackBox.width).toBeLessThanOrEqual(viewport.width + 1);

    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  });
}

test('Home Android desktop-site · el copy visible es el touch target real', async ({ browser }) => {
  const context = await browser.newContext({
    viewport: { width: 980, height: 1740 },
    hasTouch: true,
  });
  const page = await context.newPage();

  try {
    const home = await openHome(page);
    expect(await page.evaluate(() => window.matchMedia('(pointer: coarse)').matches)).toBe(true);
    expect(await page.evaluate(() => navigator.maxTouchPoints)).toBeGreaterThan(0);

    const speech = home.locator('.illustrated-home__speech');
    if (await speech.count()) {
      await speech.getByRole('button', { name: 'Cerrar comentario de Matthias' }).click();
      await expect(speech).toHaveCount(0);
    }

    const destinations = [
      ['tournament', 'TORNEOS'],
      ['train', 'ENTRENAR'],
      ['combat', 'COMBAT CHESS'],
      ['daily', 'DESAFÍO DIARIO'],
      ['history', 'HISTORIA'],
      ['play', /^(JUGAR|CONTINUAR)$/],
    ];

    for (const [id, label] of destinations) {
      const destination = home.locator(`.illustrated-home__destination--${id}`);
      const copy = destination.locator('strong');
      await expect(destination).toBeVisible();
      await expect(copy).toHaveText(label);
      expect(await copy.evaluate((node) => {
        const rect = node.getBoundingClientRect();
        const hit = document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2);
        return Boolean(hit && hit.closest('button') === node.closest('button'));
      }), `${id}: el texto visible debe resolver al botón real`).toBe(true);
    }

    await home.locator('.illustrated-home__destination--play strong').tap();
    await expect(page.getByRole('dialog')).toBeVisible();
  } finally {
    await context.close();
  }
});

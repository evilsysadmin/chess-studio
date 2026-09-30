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
  test(`Home Android · chrome y camino principal ${viewport.label}`, async ({ page }) => {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    const home = await openHome(page);

    const play = home.locator('.illustrated-home__destination--play');
    const more = home.locator('.illustrated-home__play-more');
    const landscapeHint = home.locator('.illustrated-home__landscape-hint');
    for (const [label, target] of [
      ['play', play],
      ['more', more],
      ['landscape', landscapeHint],
    ]) {
      await expect(target).toBeVisible();
      const box = await target.boundingBox();
      expect(box, `${label}: touch box`).not.toBeNull();
      expect(box.width, `${label}: touch width`).toBeGreaterThanOrEqual(44);
      expect(box.height, `${label}: touch height`).toBeGreaterThanOrEqual(44);
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

    expect(releaseBox.x + releaseBox.width).toBeLessThanOrEqual(feedbackBox.x + 1);
    expect(feedbackBox.x + feedbackBox.width).toBeLessThanOrEqual(viewport.width + 1);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  });
}

test('Home Android · portrait usa vestíbulo y reserva 3D para apaisado', async ({ browser }) => {
  for (const viewport of [
    { width: 360, height: 800, label: '360x800' },
    { width: 390, height: 844, label: '390x844' },
    { width: 430, height: 932, label: '430x932' },
  ]) {
    const context = await browser.newContext({
      viewport: { width: viewport.width, height: viewport.height },
      hasTouch: true,
    });
    await context.addInitScript(() => {
      Object.defineProperty(navigator, 'hardwareConcurrency', {
        configurable: true,
        get: () => 8,
      });
    });
    const page = await context.newPage();
    try {
      const home = await openHome(page);
      expect(await page.evaluate(() => window.matchMedia('(pointer: coarse)').matches), `${viewport.label}: coarse pointer`).toBe(true);
      await expect(home.locator('.illustrated-home__castle-3d')).toHaveCount(0);
      const landscapeHint = home.locator('.illustrated-home__landscape-hint');
      await expect(landscapeHint).toBeVisible();
      const hintBox = await landscapeHint.boundingBox();
      expect(hintBox).not.toBeNull();
      expect(hintBox.height, `${viewport.label}: landscape hint touch height`).toBeGreaterThanOrEqual(44);

      const play = home.locator('.illustrated-home__destination--play');
      await expect(play).toBeVisible();
      const playBox = await play.boundingBox();
      expect(playBox).not.toBeNull();
      expect(playBox.width, `${viewport.label}: play is the dominant action`).toBeGreaterThanOrEqual(viewport.width * 0.80);
      expect(playBox.height, `${viewport.label}: play touch height`).toBeGreaterThanOrEqual(56);

      for (const id of ['tournament', 'train', 'combat', 'daily', 'history']) {
        await expect(home.locator(`.illustrated-home__destination--${id}`)).toBeHidden();
      }
      await expect(home.locator('.illustrated-home__matthias')).toBeHidden();
      await expect(home.locator('.illustrated-home__utilities')).toBeHidden();

      const more = home.locator('.illustrated-home__play-more');
      await expect(more).toBeVisible();
      await expect(more).toHaveText(/Más/);
      const moreBox = await more.boundingBox();
      expect(moreBox).not.toBeNull();
      expect(moreBox.height, `${viewport.label}: more touch height`).toBeGreaterThanOrEqual(44);

      expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    } finally {
      await context.close();
    }
  }
});

test('Home Android 3D · apaisado libera el centro entre Matthias y 1v1', async ({ browser }) => {
  const viewport = { width: 844, height: 390 };
  const context = await browser.newContext({
    viewport,
    hasTouch: true,
  });
  await context.addInitScript(() => {
    Object.defineProperty(navigator, 'hardwareConcurrency', {
      configurable: true,
      get: () => 8,
    });
  });
  const page = await context.newPage();
  try {
    const home = await openHome(page);
    expect(await page.evaluate(() => window.matchMedia('(pointer: coarse)').matches)).toBe(true);
    await expect(home.locator('.illustrated-home__castle-3d.is-ready')).toBeVisible({ timeout: 15_000 });

    const speech = home.locator('.illustrated-home__speech');
    const pvp = page.locator('.home-pvp-roster-link:not(.home-pvp-roster-link--menu)');
    await expect(speech).toBeVisible();
    await expect(pvp).toBeVisible();

    const [speechBox, pvpBox] = await Promise.all([
      speech.boundingBox(),
      pvp.boundingBox(),
    ]);
    expect(speechBox).not.toBeNull();
    expect(pvpBox).not.toBeNull();

    expect(speechBox.width, 'Matthias speech stays compact').toBeLessThanOrEqual(viewport.width * 0.35);
    expect(pvpBox.width, '1v1 card stays compact').toBeLessThanOrEqual(viewport.width * 0.45);
    expect(pvpBox.x - (speechBox.x + speechBox.width), 'central hall corridor').toBeGreaterThanOrEqual(viewport.width * 0.12);
    expect(speechBox.y + speechBox.height).toBeLessThanOrEqual(viewport.height + 1);
    expect(pvpBox.y + pvpBox.height).toBeLessThanOrEqual(viewport.height + 1);
  } finally {
    await context.close();
  }
});

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

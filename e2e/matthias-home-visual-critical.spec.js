import { expect, test } from '@playwright/test';
import { login, mockApi } from './helpers.js';

async function openCanonicalHome(page, { reducedMotion = 'no-preference' } = {}) {
  await page.emulateMedia({ reducedMotion });
  await mockApi(page, {
    profileSeed: {
      'matthias.onboarded': '2',
      'chess-study-home-guide-dismissed-v1': '1',
    },
  });
  await login(page);

  const home = page.getByRole('region', { name: 'Modos principales' });
  await expect(home).toBeVisible();
  await expect(home.locator('.illustrated-home__stage')).toBeVisible();
  return home;
}

test('Home canónica · Matthias permanece visible y abre Así juegas', async ({ page }) => {
  const home = await openCanonicalHome(page);
  const matthias = home.getByRole('button', { name: 'Abrir Así juegas con Matthias', exact: true });

  await expect(matthias).toBeVisible();
  await expect(matthias).toContainText('MATTHIAS');
  await expect(matthias).toContainText('Comida táctica');

  await matthias.click();
  await expect(page.getByRole('heading', { name: 'Así juegas', exact: true })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Consulta diaria con Matthias' })).toBeVisible();
});

test('Home canónica · el arte y los destinos comparten el lienzo 16:9 sin overflow', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const home = await openCanonicalHome(page);
  const stage = home.locator('.illustrated-home__stage');
  const art = home.locator('.illustrated-home__art');

  for (const selector of [
    '.illustrated-home__destination--tournament',
    '.illustrated-home__destination--train',
    '.illustrated-home__destination--combat',
    '.illustrated-home__destination--daily',
    '.illustrated-home__destination--history',
    '.illustrated-home__destination--play',
  ]) {
    await expect(home.locator(selector)).toBeVisible();
  }

  const geometry = await stage.evaluate((node) => {
    const rect = node.getBoundingClientRect();
    return { width: rect.width, height: rect.height, ratio: rect.width / rect.height };
  });
  expect(geometry.ratio).toBeGreaterThan(1.75);
  expect(geometry.ratio).toBeLessThan(1.80);

  const [stageBox, artBox] = await Promise.all([stage.boundingBox(), art.boundingBox()]);
  expect(stageBox).not.toBeNull();
  expect(artBox).not.toBeNull();
  expect(Math.abs(stageBox.width - artBox.width)).toBeLessThanOrEqual(1);
  expect(Math.abs(stageBox.height - artBox.height)).toBeLessThanOrEqual(1);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
});

test('Home canónica · reduced motion elimina transiciones decorativas', async ({ page }) => {
  const home = await openCanonicalHome(page, { reducedMotion: 'reduce' });
  const destination = home.locator('.illustrated-home__destination--tournament');
  await expect(destination).toBeVisible();

  const transitionDuration = await destination.evaluate((node) => getComputedStyle(node).transitionDuration);
  expect(transitionDuration).toBe('0s');
});

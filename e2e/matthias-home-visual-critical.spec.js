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

test('Home canónica · móvil usa la escena a pantalla completa sin cementerio negro inferior', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const home = await openCanonicalHome(page);
  const stage = home.locator('.illustrated-home__stage');
  const art = home.locator('.illustrated-home__art');

  const [homeBox, stageBox, artBox] = await Promise.all([home.boundingBox(), stage.boundingBox(), art.boundingBox()]);
  expect(homeBox).not.toBeNull();
  expect(stageBox).not.toBeNull();
  expect(artBox).not.toBeNull();
  expect(homeBox.height).toBeGreaterThanOrEqual(842);
  expect(stageBox.height).toBeGreaterThanOrEqual(842);
  expect(artBox.height).toBeGreaterThanOrEqual(842);
  expect(Math.abs(stageBox.height - artBox.height)).toBeLessThanOrEqual(1);

  for (const selector of [
    '.illustrated-home__destination--tournament',
    '.illustrated-home__destination--train',
    '.illustrated-home__destination--combat',
    '.illustrated-home__destination--daily',
    '.illustrated-home__destination--history',
    '.illustrated-home__destination--play',
    '.illustrated-home__matthias',
  ]) {
    const box = await home.locator(selector).boundingBox();
    expect(box).not.toBeNull();
    expect(box.y).toBeGreaterThanOrEqual(-1);
    expect(box.y + box.height).toBeLessThanOrEqual(845);
  }

  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
});

test('Home canónica · ultrapanorámica llena el viewport y mantiene la UI clave dentro de zona segura', async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 900 });
  const home = await openCanonicalHome(page);
  const stage = home.locator('.illustrated-home__stage');
  const art = home.locator('.illustrated-home__art');

  const [homeBox, stageBox, artBox] = await Promise.all([home.boundingBox(), stage.boundingBox(), art.boundingBox()]);
  expect(homeBox).not.toBeNull();
  expect(stageBox).not.toBeNull();
  expect(artBox).not.toBeNull();
  expect(Math.abs(homeBox.width - 1920)).toBeLessThanOrEqual(2);
  expect(Math.abs(homeBox.height - 900)).toBeLessThanOrEqual(1);
  expect(Math.abs(stageBox.width - 1920)).toBeLessThanOrEqual(1);
  expect(stageBox.height).toBeGreaterThan(900);
  expect(stageBox.width / stageBox.height).toBeGreaterThan(1.75);
  expect(stageBox.width / stageBox.height).toBeLessThan(1.80);
  expect(Math.abs(stageBox.width - artBox.width)).toBeLessThanOrEqual(1);
  expect(Math.abs(stageBox.height - artBox.height)).toBeLessThanOrEqual(1);

  for (const selector of ['.illustrated-home__brand', '.illustrated-home__matthias', '.illustrated-home__motto']) {
    const box = await home.locator(selector).boundingBox();
    expect(box).not.toBeNull();
    expect(box.y).toBeGreaterThanOrEqual(-1);
    expect(box.y + box.height).toBeLessThanOrEqual(901);
  }

  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
});

test('Home canónica · reduced motion elimina transiciones decorativas', async ({ page }) => {
  const home = await openCanonicalHome(page, { reducedMotion: 'reduce' });
  const destination = home.locator('.illustrated-home__destination--tournament');
  await expect(destination).toBeVisible();

  const transitionSeconds = await destination.evaluate((node) => Number.parseFloat(getComputedStyle(node).transitionDuration) || 0);
  expect(transitionSeconds).toBeLessThanOrEqual(0.001);
});

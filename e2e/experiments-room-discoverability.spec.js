import { expect, test } from '@playwright/test';
import { login, mockApi, openMoreGameModes } from './helpers.js';

const DESTINATIONS = [
  ['.lab-workshop-portal--chronicles', 'Chronicles of Matthias'],
  ['.lab-workshop-portal--tactics', 'Chronicles of Matthias Tactics'],
  ['.lab-workshop-portal--pawnslug-godot', 'PAWN SLUG GODOT'],
  ['.lab-workshop-portal--trailblazer', 'Pawn Trailblazer'],
  ['.lab-workshop-map-table', 'Chesscom'],
  ['.lab-workshop-tool:not(.lab-workshop-tool--arena)', 'Laboratorio libre'],
  ['.lab-workshop-tool--arena', 'Arenas experimentales'],
];

async function openExperiments(page) {
  await mockApi(page, {
    profileSeed: {
      'matthias.onboarded': '2',
      'chess-study-home-guide-dismissed-v1': '1',
    },
  });
  await login(page);
  await openMoreGameModes(page);

  const tools = page.locator('#illustrated-home-tools');
  await expect(tools).toBeVisible();
  await tools.getByRole('button').filter({ hasText: 'Experimentos geniales' }).click();
  await expect(page.getByRole('heading', { name: 'Experimentos geniales', exact: true })).toBeVisible();
}

async function expectDestinationTitlesVisible(page) {
  for (const [selector, title] of DESTINATIONS) {
    const button = page.locator(selector).first();
    const strong = button.locator('strong').first();
    await expect(button, `${title}: destination button`).toBeVisible();
    await expect(strong, `${title}: semantic title`).toHaveText(title);

    const presentation = await strong.evaluate((node) => {
      const style = getComputedStyle(node);
      return {
        opacity: Number(style.opacity),
        display: style.display,
        visibility: style.visibility,
      };
    });
    expect(presentation.opacity, `${title}: title opacity`).toBeGreaterThan(0);
    expect(presentation.display, `${title}: title display`).not.toBe('none');
    expect(presentation.visibility, `${title}: title visibility`).not.toBe('hidden');
  }
}

test('Experimentos keeps every destination discoverable without baked image labels', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openExperiments(page);

  const room = page.locator('.lab-workshop');
  await expect(room).toBeVisible();
  await expect(page.locator('.lab-workshop-portal--pawnslug')).toHaveCount(0);
  await expectDestinationTitlesVisible(page);

  const [roomBox, destinationBoxes] = await Promise.all([
    room.boundingBox(),
    Promise.all(DESTINATIONS.map(([selector]) => page.locator(selector).first().boundingBox())),
  ]);
  expect(roomBox).not.toBeNull();
  const roomRight = roomBox.x + roomBox.width;
  const roomBottom = roomBox.y + roomBox.height;
  for (let index = 0; index < DESTINATIONS.length; index += 1) {
    const title = DESTINATIONS[index][1];
    const box = destinationBoxes[index];
    expect(box, `${title}: positioned inside experiments room`).not.toBeNull();
    expect(box.x, `${title}: left bound`).toBeGreaterThanOrEqual(roomBox.x - 1);
    expect(box.x + box.width, `${title}: right bound`).toBeLessThanOrEqual(roomRight + 1);
    expect(box.y, `${title}: top bound`).toBeGreaterThanOrEqual(roomBox.y - 1);
    expect(box.y + box.height, `${title}: bottom bound`).toBeLessThanOrEqual(roomBottom + 1);
  }

  const artLoaded = await page.locator('.lab-workshop-art').evaluate(
    (image) => image instanceof HTMLImageElement && image.complete && image.naturalWidth > 0 && image.naturalHeight > 0,
  );
  expect(artLoaded, 'canonical experiments room art should load').toBe(true);
});

test('Experimentos stays legible when the canonical room artwork fails', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.route('**/*experiments-room-canonical*.webp', (route) => route.abort());
  await openExperiments(page);

  const room = page.locator('.lab-workshop');
  await expect(room).toBeVisible();
  await expectDestinationTitlesVisible(page);

  const artLoaded = await page.locator('.lab-workshop-art').evaluate(
    (image) => image instanceof HTMLImageElement && image.complete && image.naturalWidth > 0,
  );
  expect(artLoaded, 'blocked canonical art must exercise the fallback').toBe(false);

  const fallback = await room.evaluate((node) => getComputedStyle(node).backgroundImage);
  expect(fallback, 'room fallback should be an authored environment, not flat black').toContain('radial-gradient');
  expect(fallback).toContain('linear-gradient');
});

import { expect, test } from '@playwright/test';
import { login, mockApi, openMoreGameModes } from './helpers.js';

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

test('Experimentos keeps every destination discoverable without baked image labels', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openExperiments(page);

  const room = page.locator('.lab-workshop');
  await expect(room).toBeVisible();

  const destinations = [
    ['.lab-workshop-portal--chronicles', 'Chronicles of Matthias'],
    ['.lab-workshop-portal--tactics', 'Chronicles of Matthias Tactics'],
    ['.lab-workshop-portal--pawnslug', 'Pawn Slug'],
    ['.lab-workshop-portal--trailblazer', 'Pawn Trailblazer'],
    ['.lab-workshop-map-table', 'Chesscom'],
    ['.lab-workshop-tool:not(.lab-workshop-tool--arena)', 'Laboratorio libre'],
    ['.lab-workshop-tool--arena', 'Arenas experimentales'],
  ];

  for (const [selector, title] of destinations) {
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
        color: style.color,
      };
    });
    expect(presentation.opacity, `${title}: title opacity`).toBeGreaterThan(0);
    expect(presentation.display, `${title}: title display`).not.toBe('none');
    expect(presentation.visibility, `${title}: title visibility`).not.toBe('hidden');
  }

  const [roomBox, destinationBoxes] = await Promise.all([
    room.boundingBox(),
    Promise.all(destinations.map(([selector]) => page.locator(selector).first().boundingBox())),
  ]);
  expect(roomBox).not.toBeNull();
  for (let index = 0; index < destinations.length; index += 1) {
    const title = destinations[index][1];
    const box = destinationBoxes[index];
    expect(box, `${title}: positioned inside experiments room`).not.toBeNull();
    expect(box.left, `${title}: left bound`).toBeGreaterThanOrEqual(roomBox.left - 1);
    expect(box.right, `${title}: right bound`).toBeLessThanOrEqual(roomBox.right + 1);
    expect(box.top, `${title}: top bound`).toBeGreaterThanOrEqual(roomBox.top - 1);
    expect(box.bottom, `${title}: bottom bound`).toBeLessThanOrEqual(roomBox.bottom + 1);
  }

  const artLoaded = await page.locator('.lab-workshop-art').evaluate(
    (image) => image instanceof HTMLImageElement && image.complete && image.naturalWidth > 0 && image.naturalHeight > 0,
  );
  expect(artLoaded, 'canonical experiments room art should load').toBe(true);
});

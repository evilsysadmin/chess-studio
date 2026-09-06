import { expect, test } from '@playwright/test';
import { login, mockApi } from './helpers.js';

async function dismissGuide(page) {
  const guide = page.getByRole('region', { name: 'Guía rápida de Chess Studio' });
  if (await guide.isVisible().catch(() => false)) {
    await guide.getByRole('button', { name: 'Ahora no', exact: true }).click();
  }
}

async function dismissMatthiasSpeech(corner) {
  const bubble = corner.getByRole('region', { name: 'Mensaje de Matthias' });
  if (!(await bubble.isVisible().catch(() => false))) return;
  const close = corner.getByRole('button', { name: 'Cerrar comentario de Matthias', exact: true });
  await close.click({ timeout: 2_500 }).catch(() => close.click({ force: true }));
  await expect(bubble).toBeHidden({ timeout: 5_000 });
}

test('Home · 390px mantiene a Matthias quieto entero dentro del castillo', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await mockApi(page, {
    profileSeed: {
      'matthias.onboarded': '2',
      'chess-study-home-guide-dismissed-v1': '1',
    },
  });
  await login(page);
  await dismissGuide(page);

  const home = page.locator('.menu.home-friendly');
  const castle = home.getByRole('region', { name: 'La estancia de Chess Studio' });
  const corner = page.getByRole('complementary', { name: 'Rincón de Matthias' });
  await expect(castle).toBeVisible();
  await expect(corner).toBeVisible();
  await expect(corner).toHaveAttribute('data-placement', 'inline');
  await dismissMatthiasSpeech(corner);
  await expect(corner).toHaveClass(/is-quiet/);

  const portrait = corner.locator('.matthias-resident__portrait-shell');
  const canvas = portrait.locator('canvas');
  await expect(portrait).toBeVisible();
  await expect(canvas).toBeVisible();

  const geometry = await page.evaluate(() => {
    const castleNode = document.querySelector('.menu.home-friendly > .home-castle-life');
    const residentNode = document.querySelector('.menu.home-friendly > .matthias-resident.is-inline.is-quiet');
    const portraitNode = residentNode?.querySelector('.matthias-resident__portrait-shell');
    if (!castleNode || !residentNode || !portraitNode) return null;
    const castleRect = castleNode.getBoundingClientRect();
    const residentRect = residentNode.getBoundingClientRect();
    const portraitRect = portraitNode.getBoundingClientRect();
    return {
      castle: { top: castleRect.top, right: castleRect.right, bottom: castleRect.bottom, left: castleRect.left },
      resident: { top: residentRect.top, right: residentRect.right, bottom: residentRect.bottom, left: residentRect.left },
      portrait: { top: portraitRect.top, right: portraitRect.right, bottom: portraitRect.bottom, left: portraitRect.left, width: portraitRect.width, height: portraitRect.height },
      scrollWidth: document.documentElement.scrollWidth,
      viewportWidth: document.documentElement.clientWidth,
    };
  });

  expect(geometry).not.toBeNull();
  expect(geometry.portrait.width).toBeGreaterThanOrEqual(124);
  expect(geometry.portrait.height).toBeGreaterThanOrEqual(128);
  expect(geometry.portrait.top).toBeGreaterThanOrEqual(geometry.castle.top + 120);
  expect(geometry.portrait.bottom).toBeLessThanOrEqual(geometry.castle.bottom - 38);
  expect(geometry.portrait.left).toBeGreaterThanOrEqual(geometry.castle.left);
  expect(geometry.portrait.right).toBeLessThanOrEqual(geometry.castle.right - 2);
  expect(geometry.scrollWidth).toBeLessThanOrEqual(geometry.viewportWidth + 1);
});

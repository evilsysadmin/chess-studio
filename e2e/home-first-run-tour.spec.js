import { expect, test } from '@playwright/test';
import { login, mockApi } from './helpers.js';

test('Home · Matthias guía el primer login y la versión sólo se marca al terminar u omitir', async ({ page }) => {
  const requests = [];
  await mockApi(page, {
    requestLog: requests,
    profileSeed: {
      'matthias.onboarded': '0',
      'chess-study-home-guide-dismissed-v1': '1',
      'chess-study-home-tour-v1': '0',
    },
  });
  await login(page);

  const tour = page.getByRole('dialog', { name:'Guía rápida de Chess Studio con Matthias' });
  await expect(tour).toBeVisible();
  await expect(tour).toHaveAttribute('data-step', 'matthias');
  await expect(tour.getByText('Guten Morgen.')).toBeVisible();
  await expect(tour.locator('.home-first-run-tour__matthias .home-matthias-3d')).toBeVisible();
  await expect(page.locator('[data-home-tour-target="matthias"]')).toBeVisible();

  // Seeing the overlay is not enough to mark it completed.
  await expect.poll(() => page.evaluate(() => localStorage.getItem('chess-study-home-tour-v1'))).toBe('0');

  await tour.getByRole('button', { name:'Siguiente' }).click();
  await tour.getByRole('button', { name:'Siguiente' }).click();
  await expect(tour).toHaveAttribute('data-step', 'play');
  await expect(page.locator('[data-home-tour-target="play"]')).toHaveClass(/is-active/);

  await page.keyboard.press('ArrowRight');
  await expect(tour).toHaveAttribute('data-step', 'train');
  await expect(page.locator('[data-home-tour-target="train"]')).toHaveClass(/is-active/);

  await page.keyboard.press('Escape');
  await expect(tour).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => localStorage.getItem('chess-study-home-tour-v1'))).toBe('1');
  await expect.poll(() => page.evaluate(() => localStorage.getItem('matthias.onboarded'))).toBe('2');

  // The guide remains intentionally replayable from the Home utilities.
  await page.getByRole('button', { name:/Mazmorras/i }).click();
  const guide = page.getByRole('button', { name:'Guía rápida', exact:true });
  await expect(guide).toBeVisible();
  await guide.click();
  await expect(page.getByRole('dialog', { name:'Guía rápida de Chess Studio con Matthias' })).toBeVisible();
});

test('Home · una partida guardada tiene prioridad sobre el tour pendiente', async ({ page }) => {
  await mockApi(page, {
    profileSeed: {
      'matthias.onboarded': '0',
      'chess-study-home-guide-dismissed-v1': '1',
      'chess-study-home-tour-v1': '0',
    },
  });
  await login(page);
  await page.evaluate(() => {
    localStorage.setItem('chess-study-active-game', 'first-run-priority-e2e');
  });
  await page.reload();

  await expect(page.getByRole('dialog', { name:'Guía rápida de Chess Studio con Matthias' })).toHaveCount(0);
  await expect(page.locator('.home-continue-card:visible, .illustrated-home__destination--play:visible')).toContainText(/Continuar|CONTINUAR/);
});

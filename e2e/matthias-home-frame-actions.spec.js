import { expect, test } from '@playwright/test';
import { login, mockApi } from './helpers.js';

async function dismissHomeGuide(page) {
  const guide = page.getByRole('region', { name: 'Guía rápida de Chess Studio' });
  if (await guide.isVisible().catch(() => false)) {
    await guide.getByRole('button', { name: 'Ahora no', exact: true }).click();
  }
}

async function openHomeAtHour(page, hour) {
  await page.addInitScript((fixedHour) => {
    Math.random = () => 0;
    Date.prototype.getHours = () => fixedHour;
  }, hour);
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await mockApi(page);
  await login(page);
  await dismissHomeGuide(page);

  const corner = page.getByRole('complementary', { name: 'Rincón de Matthias' });
  await expect(corner).toBeVisible();
  const dismiss = corner.getByRole('button', { name: 'Cerrar comentario de Matthias', exact: true });
  if (await dismiss.isVisible().catch(() => false)) await dismiss.click();
  return corner;
}

async function expectFrameAction(corner, { family, action }) {
  const sequence = corner.locator('[data-matthias-frame-sequence="true"]');
  await expect(sequence).toBeVisible();
  await expect(sequence).toHaveAttribute('data-sequence-family', family);
  await expect(sequence).toHaveAttribute('data-sequence-action', action);
  await expect(sequence.locator('[data-matthias-art-part]')).toHaveCount(0);
  await expect(sequence.locator('[data-frame-layer]')).toHaveCount(2);

  await expect.poll(
    async () => Number(await sequence.getAttribute('data-sequence-cycle-count')),
    { timeout: 3_500, message: `${action}: debe arrancar una acción completa tras una pausa breve` },
  ).toBeGreaterThan(0);

  await expect.poll(
    async () => Number(await sequence.getAttribute('data-frame-index')),
    { timeout: 4_500, message: `${action}: debe avanzar a otro fotograma real` },
  ).toBeGreaterThan(0);

  await expect(sequence).toHaveAttribute('data-sequence-state', 'acting');
}

test('Home · Matthias levanta la taza y bebe mediante fotogramas completos', async ({ page }) => {
  const corner = await openHomeAtHour(page, 7);
  await expectFrameAction(corner, { family: 'coffee', action: 'drink' });
});

test('Home · Matthias acerca la comida y come mediante fotogramas completos', async ({ page }) => {
  const corner = await openHomeAtHour(page, 12);
  await expectFrameAction(corner, { family: 'lunch', action: 'eat' });
});

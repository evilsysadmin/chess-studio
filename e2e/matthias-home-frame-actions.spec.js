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

async function expectThreeAction(corner, { profile, activity }) {
  const frame = corner.locator('[data-portrait-frame="true"]');
  const avatar = frame.locator('[data-matthias-three-avatar="true"]');
  await expect(avatar).toHaveAttribute('data-three-profile', profile);
  if (activity) await expect(avatar).toHaveAttribute('data-three-activity', activity);
  await expect(frame.locator('[data-matthias-art-part]')).toHaveCount(0);
  await expect.poll(() => avatar.getAttribute('data-three-ready'), { timeout: 4_000 }).toBe('true');
  await expect(avatar).toHaveAttribute('data-three-failed', 'false');
  await expect.poll(async () => Number(await avatar.getAttribute('data-three-energy')) || 0, { timeout: 4_000 }).toBeGreaterThan(.08);
  await expect.poll(async () => Number(await avatar.getAttribute('data-three-frame')) || 0, { timeout: 4_000 }).toBeGreaterThan(6);

  const outerFrame = await frame.evaluate((node) => ({
    transform: getComputedStyle(node).transform,
    animations: node.getAnimations().length,
  }));
  expect(outerFrame.transform).toBe('none');
  expect(outerFrame.animations).toBe(0);
}

for (const [hour, profile, activity] of [
  [7, 'sip', 'Primer café'],
  [21, 'sip', 'Turno nocturno'],
  [20, 'bite', 'Cena de campaña'],
  [10, 'dossier', 'Revisión de expedientes'],
  [17, 'dossier', 'Auditoría táctica'],
  [16, 'write', 'En plena operación'],
  [15, 'think', 'Partida privada'],
]) {
  test(`Home · ${activity} tiene una acción Three.js reconocible`, async ({ page }) => {
    const corner = await openHomeAtHour(page, hour);
    await expectThreeAction(corner, { profile, activity });
  });
}

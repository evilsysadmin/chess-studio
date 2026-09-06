import { expect, test } from '@playwright/test';
import { buttonWithVisibleText, login, mockApi } from './helpers.js';

const WAR_ROOM_READY_TIMEOUT = 45_000;

test('War Room · Hans saluda al entrar y Matthias rey responde desde su pieza', async ({ page }) => {
  test.setTimeout(90_000);

  // Give hosted/software-WebGL enough room to expose both speech phases after
  // the real renderer becomes visible. Production keeps the short 1.65/3.55 s
  // exchange; only this regression stretches those two exact timers.
  await page.addInitScript(() => {
    const nativeSetTimeout = window.setTimeout.bind(window);
    window.setTimeout = (callback, delay, ...args) => {
      const value = Number(delay);
      const stretched = value === 1650 ? 6000 : (value === 3550 ? 12000 : value);
      return nativeSetTimeout(callback, stretched, ...args);
    };
  });

  await page.setViewportSize({ width: 1440, height: 960 });
  await mockApi(page);
  await login(page);
  await buttonWithVisibleText(page, 'Partida rápida').click();
  await page.getByRole('button', { name: 'Empezar partida', exact: true }).click();

  await expect(page.locator('.board-live-row.is-3d-warroom')).toBeVisible({ timeout: WAR_ROOM_READY_TIMEOUT });
  const canvas = page.locator('.board3d-main-canvas');
  await expect(canvas).toBeVisible({ timeout: WAR_ROOM_READY_TIMEOUT });
  await expect(canvas).toHaveAttribute('data-war-room-hans-screen', 'onscreen', { timeout: 15_000 });

  const hansGreeting = page.getByRole('status', { name: 'Saludo de Hans al entrar en la Sala de guerra' });
  await expect(hansGreeting).toBeVisible({ timeout: 10_000 });
  await expect(hansGreeting).toContainText('HANS');
  await expect(hansGreeting).toContainText('Buenas tardes, señor.');

  // Quick-entry greeting owns the opening beat: Matthias' ordinary opening
  // banter must not overlap it as a second competing speech bubble.
  await expect(page.getByRole('status', { name: 'Bravuconada de Matthias al iniciar la partida' })).toHaveCount(0);

  const reply = page.getByRole('status', { name: 'Respuesta de Matthias a Hans' });
  await expect(reply).toBeVisible({ timeout: 8_000 });
  await expect(reply).toContainText('MATTHIAS');
  await expect(reply).toContainText('Buenas tardes, Hans.');
  await expect(reply).toHaveAttribute('data-matthias-square', /^[a-h][1-8]$/);
  await expect(hansGreeting).toBeHidden();
});

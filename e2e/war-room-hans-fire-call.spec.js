import { expect, test } from '@playwright/test';
import { buttonWithVisibleText, login, mockApi } from './helpers.js';

const WAR_ROOM_READY_TIMEOUT = 45_000;

test('War Room · Matthias llama a Hans por el fuego y Hans responde al aparecer', async ({ page }) => {
  test.setTimeout(90_000);

  // Hosted/software WebGL can take a little while to expose the real projected
  // anchors. Stretch only the two narrative timers so the E2E can observe both
  // exact speech beats without changing production timing.
  await page.addInitScript(() => {
    const nativeSetTimeout = window.setTimeout.bind(window);
    window.setTimeout = (callback, delay, ...args) => {
      const value = Number(delay);
      const stretched = value === 1450 || value === 1350 ? 6000 : value;
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

  const matthiasCall = page.getByRole('status', { name: 'Matthias llama a Hans por el fuego' });
  await expect(matthiasCall).toBeVisible({ timeout: 10_000 });
  await expect(matthiasCall).toContainText('MATTHIAS');
  await expect(matthiasCall).toContainText('HANS! El fuego, bitte.');
  await expect(matthiasCall).toHaveAttribute('data-matthias-square', /^[a-h][1-8]$/);

  // This kickoff owns the opening beat. Matthias must not simultaneously run
  // the ordinary opening boast and talk over his own order to Hans.
  await expect(page.getByRole('status', { name: 'Bravuconada de Matthias al iniciar la partida' })).toHaveCount(0);

  // Hans may only answer once the renderer has proved that his actual Three.js
  // body is onscreen; no disembodied "Sí, señor" from behind the wall.
  await expect(canvas).toHaveAttribute('data-war-room-hans-screen', 'onscreen', { timeout: 20_000 });
  const hansReply = page.getByRole('status', { name: 'Hans responde a Matthias' });
  await expect(hansReply).toBeVisible({ timeout: 12_000 });
  await expect(hansReply).toContainText('HANS');
  await expect(hansReply).toContainText('Sí, señor.');
  await expect(matthiasCall).toBeHidden();
});

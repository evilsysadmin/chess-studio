import { expect } from '@playwright/test';
import { activateSetupControl, buttonWithVisibleText } from './helpers.js';

// Only the E2E benchmark uses this entrance.  Real UI clicks and the real
// quick-match modal/game route are mandatory; no synthetic canvas or game.
// Home's primary play object can transition between 3D and fallback markup
// while the click settles. Retry the *entry* at most once if no modal opened.
export async function enterWarRoomGpuQuickMatch(page) {
  const entry = buttonWithVisibleText(page, 'Partida rápida');
  const dialog = page.getByRole('dialog', { name: 'Configurar partida rápida' });
  const board = page.locator('[data-board3d-war-room="true"]');
  await expect(entry).toBeVisible({ timeout: 20_000 });
  await expect(entry).toBeEnabled({ timeout: 20_000 });
  await entry.click();

  if (!await dialog.isVisible().catch(() => false)) {
    try {
      await expect(dialog).toBeVisible({ timeout: 8_000 });
    } catch {
      // A saved game can send the Home play object to Continue instead of
      // opening the quick-match modal. Never mistake it for a fresh game.
      if (await board.isVisible().catch(() => false)) {
        throw new Error('War Room GPU benchmark unexpectedly resumed an active game; fresh quick-match required');
      }
      if (await entry.isVisible().catch(() => false)) {
        // IsVisible and Locator.evaluate are separate DOM reads: the 3D Home
        // can unmount the hotspot between them. Bound this retry so a stale
        // locator cannot consume the entire E2E budget while the dialog/route
        // already transitioned. Final modal assertion remains mandatory.
        try {
          await entry.evaluate((element) => element.click(), undefined, { timeout: 3_000 });
        } catch {
          // A disappearing entry is not success. Continue to the explicit
          // modal/board assertion and its richer Home-state diagnostic.
        }
      }
    }
  }
  try {
    await expect(dialog).toBeVisible({ timeout: 25_000 });
  } catch (error) {
    const state = await page.evaluate(() => ({
      path: location.pathname,
      dialogs: [...document.querySelectorAll('[role="dialog"]')]
        .map((el) => el.getAttribute('aria-label') || el.textContent?.slice(0, 80) || ''),
      playEntryCount: document.querySelectorAll(
        '.home-mode-quick, .home-castle-hub__room--play, .illustrated-home__destination--play',
      ).length,
      boardVisible: Boolean(document.querySelector('[data-board3d-war-room="true"]')),
      bodyExcerpt: (document.body?.innerText || '').slice(0, 260),
    })).catch(() => ({ state: 'unavailable' }));
    throw new Error('War Room GPU benchmark could not open real quick-match dialog: '
      + JSON.stringify(state) + '; ' + String(error?.message || error).slice(0, 300));
  }
  const start = dialog.getByRole('button', { name: 'Empezar partida', exact: true });
  await expect(start).toBeVisible({ timeout: 30_000 });
  await activateSetupControl(start);
  await expect(board).toBeVisible({ timeout: 75_000 });
  return { board, dialog };
}

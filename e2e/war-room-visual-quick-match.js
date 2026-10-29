import { expect } from '@playwright/test';

// War Room visual producers must enter a REAL game, not fake its canvas/HUD.
// Under overloaded SwiftShader, React's quick-start button may be remounted
// during a DOM click. Retry the real CTA once only if nothing started.
export async function launchWarRoomVisualQuickMatch(page, dialog) {
  const start = dialog.getByRole('button', { name: 'Empezar partida', exact: true });
  const board = page.locator('[data-board3d-war-room="true"]');
  await expect(start).toBeVisible({ timeout: 20_000 });
  await expect(start).toBeEnabled();
  await start.evaluate((button) => button.click());

  try {
    // Render boot itself can take considerably longer; the short probe is
    // solely to detect an ignored click, never a pass/fail cutoff.
    await board.waitFor({ state: 'visible', timeout: 12_000 });
  } catch {
    if (await dialog.isVisible().catch(() => false)) {
      const ready = await dialog.getByRole('button', { name: 'Empezar partida', exact: true })
        .isEnabled().catch(() => false);
      const alert = await dialog.locator('[role="alert"]').textContent().catch(() => '');
      if (alert?.trim()) throw new Error(`War Room quick match refused to start: ${alert.trim()}`);
      // Disabled/loading CTA means a legitimate start is in progress:
      // never submit a duplicate game or short-circuit the readiness gate.
      if (ready) {
        console.log('WAR_ROOM_VISUAL_QUICK_START_RETRY click ignored; retrying current CTA once');
        await dialog.getByRole('button', { name: 'Empezar partida', exact: true })
          .evaluate((button) => button.click());
      }
    }
  }

  await expect(board).toBeVisible({ timeout: 60_000 });
  await expect(dialog).toBeHidden({ timeout: 30_000 });
  return board;
}

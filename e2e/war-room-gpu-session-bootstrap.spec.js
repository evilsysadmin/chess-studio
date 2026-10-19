import { expect, test } from '@playwright/test';
import { mockApi, waitForHomeInteractive } from './helpers.js';
import { enterWarRoomGpuQuickMatch } from './war-room-gpu-quick-match.js';

// Lightweight software/CI regression for the exact session-restoration route
// used by the local GPU A/B harness. GPU timings remain local-only.
test('War Room benchmark restores Home and enters a real quick-match 3D board', async ({ browser }) => {
  test.setTimeout(150_000);
  const context = await browser.newContext({
    baseURL: test.info().project.use.baseURL || 'http://127.0.0.1:4173/chess-studio/',
    viewport: { width: 1440, height: 900 },
    serviceWorkers: 'block',
  });
  try {
    await context.addInitScript(() => {
      localStorage.setItem('chess-study-auth-token', 'e2e-token');
      localStorage.setItem('chess-study-auth-username', 'e2e');
      // The real local benchmark enables this before mounting the board.
      // Assert in CI that an opted-in software renderer also exposes the
      // actual render-cost journal (not fabricated GPU timer queries).
      localStorage.setItem('war-room-gpu-profile', '1');
      sessionStorage.setItem('chess-study-current-view', 'menu');
    });
    const page = await context.newPage();
    await mockApi(page);
    await page.goto('./', { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('region', { name: 'Modos principales', exact: true }))
      .toBeVisible({ timeout: 45_000 });
    await waitForHomeInteractive(page);
    await expect(page.getByLabel('Usuario')).toHaveCount(0);
    // This gate must launch a real game, not just verify the Home play tile.
    // The local A/B failed on all profiles because the modal never opened.
    const { board, dialog } = await enterWarRoomGpuQuickMatch(page);
    await expect(board).toBeVisible();
    const canvas = page.locator('canvas.board3d-main-canvas');
    await expect(canvas).toBeVisible({ timeout: 75_000 });
    await expect(dialog).toBeHidden({ timeout: 30_000 });
    // The previous smoke verified only access to the 3D board. If a future
    // refactor silently disconnects the opt-in journal from renderer.render(),
    // the physical baseline would otherwise fail only on the user's NVIDIA.
    // Software Chromium can verify real draw submissions, NOT GPU elapsed.
    await expect.poll(() => canvas.evaluate((element) => {
      const journal = element.__warRoomRenderCostJournal;
      if (!journal || journal.latestSeq < 1) return false;
      const captured = journal.readAfter(Math.max(0, journal.latestSeq - 16));
      return !captured.overflow && captured.samples.some((frame) =>
        Number.isFinite(frame.startedAtMs)
        && Number.isFinite(frame.endedAtMs)
        && Number.isFinite(frame.cpuSubmitMs)
        && frame.endedAtMs >= frame.startedAtMs
        && frame.cpuSubmitMs >= 0
        && Number.isFinite(frame.calls) && frame.calls > 0
        && Number.isFinite(frame.triangles) && frame.triangles > 0);
    }), { timeout: 30_000, message: 'Opt-in War Room journal must record real 3D draws' })
      .toBe(true);
  } finally {
    await context.close();
  }
});

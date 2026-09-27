import { describe, expect, it, vi } from 'vitest';
import { runUserInitiatedWarRoomEntry } from './warRoomEntry.js';

describe('runUserInitiatedWarRoomEntry', () => {
  it('requests landscape before starting a user-initiated 3D War Room entry', async () => {
    const calls = [];
    const start = vi.fn(async () => { calls.push('start'); return true; });
    const requestLandscape = vi.fn(async () => { calls.push('landscape'); return { fullscreen: true, landscape: true }; });

    await expect(runUserInitiatedWarRoomEntry(start, {
      boardRenderer: '3d',
      shouldAutoRotate: () => true,
      requestLandscape,
    })).resolves.toBe(true);

    expect(calls).toEqual(['landscape', 'start']);
  });

  it('does not rotate explicit 2D entries', async () => {
    const start = vi.fn(async () => true);
    const requestLandscape = vi.fn();

    await runUserInitiatedWarRoomEntry(start, {
      boardRenderer: '2d',
      shouldAutoRotate: () => true,
      requestLandscape,
    });

    expect(requestLandscape).not.toHaveBeenCalled();
    expect(start).toHaveBeenCalledTimes(1);
  });

  it('releases fullscreen and orientation when the resumed entry fails', async () => {
    const exitFullscreen = vi.fn(async () => true);
    const unlockOrientation = vi.fn(() => true);

    await expect(runUserInitiatedWarRoomEntry(async () => false, {
      boardRenderer: '3d',
      shouldAutoRotate: () => true,
      requestLandscape: vi.fn(async () => ({ fullscreen: true, landscape: true })),
      exitFullscreen,
      unlockOrientation,
    })).resolves.toBe(false);

    expect(exitFullscreen).toHaveBeenCalledTimes(1);
    expect(unlockOrientation).toHaveBeenCalledTimes(1);
  });
});

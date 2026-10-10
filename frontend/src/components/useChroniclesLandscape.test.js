import { describe, expect, it, vi } from 'vitest';
import {
  releaseChroniclesLandscape,
  requestChroniclesLandscapeOnEntry,
  shouldAutoRotateChroniclesOnEntry,
} from './useChroniclesLandscape.js';

describe('Chronicles immersive entry', () => {
  it('targets phone-like coarse-pointer viewports only', () => {
    const mobile = { innerWidth: 390, matchMedia: vi.fn(() => ({ matches: true })) };
    const desktop = { innerWidth: 1440, matchMedia: vi.fn(() => ({ matches: false })) };
    const wideTouch = { innerWidth: 1024, matchMedia: vi.fn(() => ({ matches: true })) };

    expect(shouldAutoRotateChroniclesOnEntry({ win: mobile })).toBe(true);
    expect(shouldAutoRotateChroniclesOnEntry({ win: desktop })).toBe(false);
    expect(shouldAutoRotateChroniclesOnEntry({ win: wideTouch })).toBe(false);
  });

  it('uses viewport-owned immersion on desktop without requesting browser fullscreen', async () => {
    const requestFullscreen = vi.fn(async () => {});
    const lock = vi.fn();
    const win = { innerWidth: 1440, matchMedia: vi.fn(() => ({ matches: false })) };
    const doc = { documentElement: { requestFullscreen }, fullscreenElement: null };
    const screenApi = { orientation: { lock } };

    await expect(requestChroniclesLandscapeOnEntry({ win, doc, screenApi })).resolves.toEqual({
      requested: false, fullscreen: false, landscape: false,
    });
    expect(requestFullscreen).not.toHaveBeenCalled();
    expect(lock).not.toHaveBeenCalled();
  });

  it('requests landscape but never native fullscreen on a mobile entry gesture', async () => {
    const requestFullscreen = vi.fn(async () => {});
    const lock = vi.fn(async () => {});
    const win = { innerWidth: 390, matchMedia: vi.fn(() => ({ matches: true })) };
    const doc = { documentElement: { requestFullscreen }, fullscreenElement: null };
    const screenApi = { orientation: { lock } };

    await expect(requestChroniclesLandscapeOnEntry({ win, doc, screenApi })).resolves.toEqual({
      requested: true, fullscreen: false, landscape: true,
    });
    expect(requestFullscreen).not.toHaveBeenCalled();
    expect(lock).toHaveBeenCalledOnce();
    expect(lock).toHaveBeenCalledWith('landscape');
  });

  it('degrades gracefully when mobile landscape lock requires native fullscreen', async () => {
    const lock = vi.fn().mockRejectedValue(new Error('fullscreen required'));
    const win = { innerWidth: 390, matchMedia: vi.fn(() => ({ matches: true })) };
    await expect(requestChroniclesLandscapeOnEntry({
      win, screenApi: { orientation: { lock } },
    })).resolves.toEqual({ requested: true, fullscreen: false, landscape: false });
  });

  it('releases its orientation lock without exiting user-owned native fullscreen', async () => {
    const unlock = vi.fn();
    const exitFullscreen = vi.fn().mockResolvedValue(undefined);
    const root = {};
    const doc = { documentElement: root, fullscreenElement: root, exitFullscreen };
    const screenApi = { orientation: { unlock } };

    await expect(releaseChroniclesLandscape({ doc, screenApi })).resolves.toEqual({
      unlocked: true, fullscreen: false,
    });
    expect(unlock).toHaveBeenCalledOnce();
    expect(exitFullscreen).not.toHaveBeenCalled();
  });
});

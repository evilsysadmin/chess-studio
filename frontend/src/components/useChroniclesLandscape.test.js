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

  it('requests fullscreen first and then locks landscape from the entry gesture', async () => {
    const order = [];
    const requestFullscreen = vi.fn(async () => { order.push('fullscreen'); });
    const lock = vi.fn(async () => { order.push('landscape'); });
    const win = { innerWidth: 390, matchMedia: vi.fn(() => ({ matches: true })) };
    const doc = { documentElement: { requestFullscreen }, fullscreenElement: null };
    const screenApi = { orientation: { lock } };

    await expect(requestChroniclesLandscapeOnEntry({ win, doc, screenApi })).resolves.toEqual({
      requested: true,
      fullscreen: true,
      landscape: true,
    });
    expect(order).toEqual(['fullscreen', 'landscape']);
  });

  it('requests browser fullscreen on desktop without locking orientation', async () => {
    const requestFullscreen = vi.fn(async () => {});
    const lock = vi.fn();
    const win = { innerWidth: 1440, matchMedia: vi.fn(() => ({ matches: false })) };
    const doc = { documentElement: { requestFullscreen }, fullscreenElement: null };
    const screenApi = { orientation: { lock } };

    await expect(requestChroniclesLandscapeOnEntry({ win, doc, screenApi })).resolves.toEqual({
      requested: true,
      fullscreen: true,
      landscape: false,
    });
    expect(requestFullscreen).toHaveBeenCalledOnce();
    expect(lock).not.toHaveBeenCalled();
  });

  it('releases orientation and native fullscreen on exit', async () => {
    const unlock = vi.fn();
    const exitFullscreen = vi.fn().mockResolvedValue(undefined);
    const root = {};
    const doc = { documentElement: root, fullscreenElement: root, exitFullscreen };
    const screenApi = { orientation: { unlock } };

    await expect(releaseChroniclesLandscape({ doc, screenApi })).resolves.toEqual({
      unlocked: true,
      fullscreen: true,
    });
    expect(unlock).toHaveBeenCalledOnce();
    expect(exitFullscreen).toHaveBeenCalledOnce();
  });
});

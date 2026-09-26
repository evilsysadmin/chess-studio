import { describe, expect, it, vi } from 'vitest';
import {
  exitWarRoomBrowserFullscreen,
  getWarRoomBrowserFullscreenElement,
  requestWarRoomBrowserFullscreen,
  requestWarRoomLandscape,
  requestWarRoomLandscapeFullscreen,
  shouldAutoRotateWarRoomOnEntry,
  unlockWarRoomOrientation,
} from './useWarRoomImmersive.js';

describe('War Room browser fullscreen bridge', () => {
  it('requests native fullscreen from the document root when available', async () => {
    const requestFullscreen = vi.fn(() => Promise.resolve());
    const documentElement = { requestFullscreen };
    const doc = { documentElement, fullscreenElement: null };

    await expect(requestWarRoomBrowserFullscreen(doc)).resolves.toBe(true);
    expect(requestFullscreen).toHaveBeenCalledTimes(1);
  });

  it('falls back cleanly when the browser rejects or does not support fullscreen', async () => {
    const rejected = {
      documentElement: { requestFullscreen: vi.fn(() => Promise.reject(new Error('blocked'))) },
      fullscreenElement: null,
    };
    const unsupported = { documentElement: {}, fullscreenElement: null };

    await expect(requestWarRoomBrowserFullscreen(rejected)).resolves.toBe(false);
    await expect(requestWarRoomBrowserFullscreen(unsupported)).resolves.toBe(false);
  });

  it('supports the WebKit fullscreen aliases used by older mobile engines', async () => {
    const webkitRequestFullscreen = vi.fn();
    const webkitExitFullscreen = vi.fn();
    const root = { webkitRequestFullscreen };
    const doc = {
      documentElement: root,
      webkitFullscreenElement: null,
      webkitExitFullscreen,
    };

    await expect(requestWarRoomBrowserFullscreen(doc)).resolves.toBe(true);
    doc.webkitFullscreenElement = root;
    expect(getWarRoomBrowserFullscreenElement(doc)).toBe(root);
    await expect(exitWarRoomBrowserFullscreen(doc)).resolves.toBe(true);
    expect(webkitRequestFullscreen).toHaveBeenCalledTimes(1);
    expect(webkitExitFullscreen).toHaveBeenCalledTimes(1);
  });

  it('does not try to exit native fullscreen when none is active', async () => {
    const exitFullscreen = vi.fn();
    const doc = { documentElement: {}, fullscreenElement: null, exitFullscreen };

    await expect(exitWarRoomBrowserFullscreen(doc)).resolves.toBe(false);
    expect(exitFullscreen).not.toHaveBeenCalled();
  });
});


describe('War Room Android orientation', () => {
  it('auto-rotates only on coarse-pointer mobile viewports', () => {
    const mobile = { innerWidth: 390, matchMedia: vi.fn(() => ({ matches: true })) };
    const desktop = { innerWidth: 1440, matchMedia: vi.fn(() => ({ matches: false })) };
    const wideTouch = { innerWidth: 1024, matchMedia: vi.fn(() => ({ matches: true })) };

    expect(shouldAutoRotateWarRoomOnEntry({ win: mobile })).toBe(true);
    expect(shouldAutoRotateWarRoomOnEntry({ win: desktop })).toBe(false);
    expect(shouldAutoRotateWarRoomOnEntry({ win: wideTouch })).toBe(false);
  });

  it('requests landscape from the immersive tap when supported', async () => {
    const lock = vi.fn().mockResolvedValue(undefined);
    await expect(requestWarRoomLandscape({ orientation: { lock } })).resolves.toBe(true);
    expect(lock).toHaveBeenCalledWith('landscape');
  });

  it('enters fullscreen before requesting landscape on Android', async () => {
    const order = [];
    const requestFullscreen = vi.fn(async () => { order.push('fullscreen'); });
    const lock = vi.fn(async () => { order.push('landscape'); });
    const doc = { documentElement: { requestFullscreen }, fullscreenElement: null };
    const screenApi = { orientation: { lock } };

    await expect(requestWarRoomLandscapeFullscreen({ doc, screenApi })).resolves.toEqual({
      fullscreen: true,
      landscape: true,
    });
    expect(order).toEqual(['fullscreen', 'landscape']);
  });

  it('degrades safely when orientation lock is unavailable or rejected', async () => {
    await expect(requestWarRoomLandscape({ orientation: {} })).resolves.toBe(false);
    const lock = vi.fn().mockRejectedValue(new Error('blocked'));
    await expect(requestWarRoomLandscape({ orientation: { lock } })).resolves.toBe(false);
  });

  it('unlocks orientation when leaving immersion', () => {
    const unlock = vi.fn();
    expect(unlockWarRoomOrientation({ orientation: { unlock } })).toBe(true);
    expect(unlock).toHaveBeenCalledOnce();
  });
});

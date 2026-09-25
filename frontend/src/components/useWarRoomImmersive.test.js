import { describe, expect, it, vi } from 'vitest';
import {
  exitWarRoomBrowserFullscreen,
  getWarRoomBrowserFullscreenElement,
  requestWarRoomBrowserFullscreen,
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

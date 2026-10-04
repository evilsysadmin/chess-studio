import { describe, expect, it, vi } from 'vitest';
import {
  exitChroniclesBrowserFullscreen,
  requestChroniclesBrowserFullscreen,
} from './chroniclesBrowserFullscreen.js';

describe('Chronicles browser fullscreen bridge', () => {
  it('requests native fullscreen from the document root', async () => {
    const requestFullscreen = vi.fn(() => Promise.resolve());
    const documentElement = { requestFullscreen };
    const doc = { documentElement, fullscreenElement: null };

    await expect(requestChroniclesBrowserFullscreen(doc)).resolves.toBe(true);
    expect(requestFullscreen).toHaveBeenCalledTimes(1);
    expect(requestFullscreen.mock.instances[0]).toBe(documentElement);
  });

  it('is a safe no-op when fullscreen is unavailable or already active', async () => {
    const root = {};
    await expect(requestChroniclesBrowserFullscreen({ documentElement: root, fullscreenElement: null })).resolves.toBe(false);

    const requestFullscreen = vi.fn();
    const activeRoot = { requestFullscreen };
    await expect(requestChroniclesBrowserFullscreen({
      documentElement: activeRoot,
      fullscreenElement: activeRoot,
    })).resolves.toBe(false);
    expect(requestFullscreen).not.toHaveBeenCalled();
  });

  it('swallows browser policy rejection and keeps the viewport fallback usable', async () => {
    const requestFullscreen = vi.fn(() => Promise.reject(new Error('NotAllowedError')));
    const documentElement = { requestFullscreen };
    const doc = { documentElement, fullscreenElement: null };

    await expect(requestChroniclesBrowserFullscreen(doc)).resolves.toBe(false);
  });

  it('exits only the fullscreen session owned by the document root', async () => {
    const exitFullscreen = vi.fn(() => Promise.resolve());
    const documentElement = {};
    const doc = { documentElement, fullscreenElement: documentElement, exitFullscreen };

    await expect(exitChroniclesBrowserFullscreen(doc)).resolves.toBe(true);
    expect(exitFullscreen).toHaveBeenCalledTimes(1);
    expect(exitFullscreen.mock.instances[0]).toBe(doc);

    const foreignElement = {};
    const otherDoc = { documentElement, fullscreenElement: foreignElement, exitFullscreen };
    await expect(exitChroniclesBrowserFullscreen(otherDoc)).resolves.toBe(false);
    expect(exitFullscreen).toHaveBeenCalledTimes(1);
  });
});

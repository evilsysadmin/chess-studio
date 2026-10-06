import { describe, expect, it, vi } from 'vitest';
import {
  exitChessFootballBrowserFullscreen,
  requestChessFootballBrowserFullscreen,
} from './chessFootballBrowserFullscreen.js';

describe('Chess Football browser fullscreen bridge', () => {
  it('requests fullscreen from the document root', async () => {
    const requestFullscreen = vi.fn(() => Promise.resolve());
    const documentElement = { requestFullscreen };
    const doc = { documentElement, fullscreenElement: null };

    await expect(requestChessFootballBrowserFullscreen(doc)).resolves.toBe(true);
    expect(requestFullscreen).toHaveBeenCalledTimes(1);
  });

  it('does not request fullscreen twice', async () => {
    const requestFullscreen = vi.fn(() => Promise.resolve());
    const documentElement = { requestFullscreen };
    const doc = { documentElement, fullscreenElement: documentElement };

    await expect(requestChessFootballBrowserFullscreen(doc)).resolves.toBe(false);
    expect(requestFullscreen).not.toHaveBeenCalled();
  });

  it('only exits fullscreen owned by the document root', async () => {
    const exitFullscreen = vi.fn(() => Promise.resolve());
    const documentElement = {};
    const doc = { documentElement, fullscreenElement: documentElement, exitFullscreen };

    await expect(exitChessFootballBrowserFullscreen(doc)).resolves.toBe(true);
    expect(exitFullscreen).toHaveBeenCalledTimes(1);

    const foreign = {};
    doc.fullscreenElement = foreign;
    await expect(exitChessFootballBrowserFullscreen(doc)).resolves.toBe(false);
    expect(exitFullscreen).toHaveBeenCalledTimes(1);
  });
});

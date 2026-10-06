import { describe, expect, it, vi } from 'vitest';
import {
  chroniclesDesktopFullscreenEligible,
  chroniclesRequestDesktopFullscreen,
} from './useChroniclesDesktopFullscreen.js';

function fakeWindow({ width = 1440, fine = true, touchPoints = 0 } = {}) {
  return {
    innerWidth: width,
    navigator: { maxTouchPoints: touchPoints },
    matchMedia: () => ({ matches: fine }),
  };
}

describe('Chronicles desktop fullscreen policy', () => {
  it('enables native fullscreen for a fine-pointer desktop viewport', () => {
    expect(chroniclesDesktopFullscreenEligible(fakeWindow())).toBe(true);
  });

  it('keeps native fullscreen disabled for coarse-pointer mobile surfaces', () => {
    expect(chroniclesDesktopFullscreenEligible(fakeWindow({ width: 844, fine: false, touchPoints: 1 }))).toBe(false);
    expect(chroniclesDesktopFullscreenEligible(fakeWindow({ width: 390, fine: false, touchPoints: 1 }))).toBe(false);
  });

  it('still treats a wide fine-pointer hybrid laptop as desktop', () => {
    expect(chroniclesDesktopFullscreenEligible(fakeWindow({ width: 1440, fine: true, touchPoints: 10 }))).toBe(true);
  });

  it('does not classify narrow fine-pointer windows as desktop Chronicles', () => {
    expect(chroniclesDesktopFullscreenEligible(fakeWindow({ width: 760 }))).toBe(false);
  });
  it('requests native fullscreen from an eligible desktop gesture path', async () => {
    const requestFullscreen = vi.fn(async () => {
      fakeDoc.fullscreenElement = fakeDoc.documentElement;
    });
    const fakeDoc = {
      fullscreenElement: null,
      documentElement: { requestFullscreen },
    };
    const win = fakeWindow();

    await expect(chroniclesRequestDesktopFullscreen(fakeDoc, win)).resolves.toBe(true);
    expect(requestFullscreen).toHaveBeenCalledWith({ navigationUI: 'hide' });
  });


});

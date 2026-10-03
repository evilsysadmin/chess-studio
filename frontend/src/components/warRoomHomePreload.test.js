import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  getBoardRenderer,
  preloadBoard3DRenderer,
  loadWarRoomVariant,
  prefetchWarRoomVariant,
} = vi.hoisted(() => ({
  getBoardRenderer: vi.fn(() => '3d'),
  preloadBoard3DRenderer: vi.fn(() => Promise.resolve({ default: () => null })),
  loadWarRoomVariant: vi.fn(() => 'v4'),
  prefetchWarRoomVariant: vi.fn(() => Promise.resolve(true)),
}));

vi.mock('../userPreferences.js', () => ({ getBoardRenderer }));
vi.mock('./Board3DRegistration.js', () => ({ preloadBoard3DRenderer }));
vi.mock('./WarRoomVariant.js', () => ({ loadWarRoomVariant, prefetchWarRoomVariant }));

import {
  preloadPreferredWarRoomFromHome,
  schedulePreferredWarRoomHomePreload,
  shouldPreloadWarRoomFromHome,
} from './warRoomHomePreload.js';

function mobileWindow(overrides = {}) {
  return {
    innerWidth: 390,
    matchMedia: vi.fn(() => ({ matches: true })),
    requestIdleCallback: vi.fn(),
    cancelIdleCallback: vi.fn(),
    setTimeout: vi.fn(),
    clearTimeout: vi.fn(),
    ...overrides,
  };
}

describe('authenticated Home War Room preload', () => {
  beforeEach(() => {
    getBoardRenderer.mockReset().mockReturnValue('3d');
    preloadBoard3DRenderer.mockReset().mockResolvedValue({ default: () => null });
    loadWarRoomVariant.mockReset().mockReturnValue('v4');
    prefetchWarRoomVariant.mockReset().mockResolvedValue(true);
  });

  it('waits for Home idle, then warms shared Board3D and the selected room', async () => {
    let idleCallback = null;
    const windowRef = mobileWindow({
      requestIdleCallback: vi.fn((callback) => {
        idleCallback = callback;
        return 17;
      }),
    });
    const documentRef = { visibilityState: 'visible' };
    const navigatorRef = { maxTouchPoints: 5, connection: { effectiveType: '4g', saveData: false } };

    const cancel = schedulePreferredWarRoomHomePreload({ windowRef, documentRef, navigatorRef });

    expect(windowRef.requestIdleCallback).toHaveBeenCalledWith(expect.any(Function), { timeout: 900 });
    expect(preloadBoard3DRenderer).not.toHaveBeenCalled();

    idleCallback();
    await vi.waitFor(() => expect(preloadBoard3DRenderer).toHaveBeenCalledTimes(1));
    expect(loadWarRoomVariant).toHaveBeenCalledTimes(1);
    expect(prefetchWarRoomVariant).toHaveBeenCalledWith('v4');

    cancel();
    expect(windowRef.cancelIdleCallback).toHaveBeenCalledWith(17);
  });

  it('does not spend the 3D preload on explicit 2D, data saver or a slow mobile link', () => {
    const base = {
      windowRef: mobileWindow(),
      documentRef: { visibilityState: 'visible' },
      navigatorRef: { maxTouchPoints: 5, connection: { effectiveType: '4g', saveData: false } },
    };

    expect(shouldPreloadWarRoomFromHome({ ...base, boardRenderer: '2d' })).toBe(false);
    expect(shouldPreloadWarRoomFromHome({
      ...base,
      navigatorRef: { maxTouchPoints: 5, connection: { effectiveType: '4g', saveData: true } },
    })).toBe(false);
    expect(shouldPreloadWarRoomFromHome({
      ...base,
      navigatorRef: { maxTouchPoints: 5, connection: { effectiveType: '2g', saveData: false } },
    })).toBe(false);
  });

  it('warms the 3D path on desktop instead of entering the War Room cold', () => {
    expect(shouldPreloadWarRoomFromHome({
      windowRef: mobileWindow({
        innerWidth: 1440,
        matchMedia: vi.fn(() => ({ matches: false })),
      }),
      documentRef: { visibilityState: 'visible' },
      navigatorRef: { maxTouchPoints: 0, connection: { effectiveType: '4g', saveData: false } },
      boardRenderer: '3d',
    })).toBe(true);
  });

  it('uses a short timer when requestIdleCallback is unavailable', async () => {
    let timerCallback = null;
    const windowRef = mobileWindow({
      requestIdleCallback: undefined,
      setTimeout: vi.fn((callback, delay) => {
        timerCallback = callback;
        expect(delay).toBe(250);
        return 23;
      }),
    });
    const options = {
      windowRef,
      documentRef: { visibilityState: 'visible' },
      navigatorRef: { maxTouchPoints: 1, connection: { effectiveType: '4g', saveData: false } },
    };

    const cancel = schedulePreferredWarRoomHomePreload(options);
    expect(preloadBoard3DRenderer).not.toHaveBeenCalled();

    timerCallback();
    await vi.waitFor(() => expect(preloadBoard3DRenderer).toHaveBeenCalledTimes(1));

    cancel();
    expect(windowRef.clearTimeout).toHaveBeenCalledWith(23);
  });

  it('swallows speculative renderer failures so the real War Room can retry later', async () => {
    preloadBoard3DRenderer.mockRejectedValueOnce(new Error('transient chunk failure'));

    await expect(preloadPreferredWarRoomFromHome({
      windowRef: mobileWindow(),
      documentRef: { visibilityState: 'visible' },
      navigatorRef: { maxTouchPoints: 2, connection: { effectiveType: '4g', saveData: false } },
      boardRenderer: '3d',
    })).resolves.toBe(false);
  });
});

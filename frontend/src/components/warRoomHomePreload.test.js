import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  getBoardRenderer,
  preloadBoard3DRenderer,
  isWarRoomVariantSelectable,
  loadWarRoomVariant,
  prefetchWarRoomVariant,
} = vi.hoisted(() => ({
  getBoardRenderer: vi.fn(() => '3d'),
  preloadBoard3DRenderer: vi.fn(() => Promise.resolve({ default: () => null })),
  isWarRoomVariantSelectable: vi.fn(() => true),
  loadWarRoomVariant: vi.fn(() => 'v3'),
  prefetchWarRoomVariant: vi.fn(() => Promise.resolve(true)),
}));

vi.mock('../userPreferences.js', () => ({ getBoardRenderer }));
vi.mock('./Board3DRegistration.js', () => ({ preloadBoard3DRenderer }));
vi.mock('./WarRoomVariant.js', () => ({
  WAR_ROOM_VARIANTS: [
    { id: 'classic', shell: 'procedural' },
    { id: 'v2', shell: 'blender' },
    { id: 'v3', shell: 'blender' },
    { id: 'v4', shell: 'blender' },
  ],
  isWarRoomVariantSelectable,
  loadWarRoomVariant,
  prefetchWarRoomVariant,
}));

import {
  preloadPreferredWarRoomFromHome,
  schedulePreferredWarRoomHomePreload,
  shouldPreloadAllWarRoomsFromHome,
  shouldPreloadWarRoomFromHome,
} from './warRoomHomePreload.js';

function mobileWindow(overrides = {}) {
  return {
    innerWidth: 390,
    matchMedia: vi.fn(() => ({ matches: false })),
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
    isWarRoomVariantSelectable.mockReset().mockReturnValue(true);
    loadWarRoomVariant.mockReset().mockReturnValue('v3');
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
    expect(prefetchWarRoomVariant).toHaveBeenCalledWith('v3');

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

  it('warms the selected 3D path on desktop instead of entering the War Room cold', () => {
    const windowRef = mobileWindow({
      innerWidth: 1440,
      matchMedia: vi.fn((query) => ({ matches: query.includes('pointer: fine') })),
    });
    const options = {
      windowRef,
      documentRef: { visibilityState: 'visible' },
      navigatorRef: { maxTouchPoints: 0, connection: { effectiveType: '4g', saveData: false } },
      boardRenderer: '3d',
    };
    expect(shouldPreloadWarRoomFromHome(options)).toBe(true);
    expect(shouldPreloadAllWarRoomsFromHome(options)).toBe(true);
  });

  it('keeps the all-room sweep desktop-only and disabled behind the rollback flag', () => {
    const desktop = {
      windowRef: mobileWindow({
        innerWidth: 1440,
        matchMedia: vi.fn(() => ({ matches: true })),
      }),
      documentRef: { visibilityState: 'visible' },
      navigatorRef: { maxTouchPoints: 0, connection: { effectiveType: '4g', saveData: false } },
      boardRenderer: '3d',
    };
    expect(shouldPreloadAllWarRoomsFromHome(desktop)).toBe(true);

    expect(shouldPreloadAllWarRoomsFromHome({
      ...desktop,
      windowRef: mobileWindow({ innerWidth: 430 }),
      navigatorRef: { maxTouchPoints: 5, connection: { effectiveType: '4g', saveData: false } },
    })).toBe(false);

    isWarRoomVariantSelectable.mockReturnValueOnce(false);
    expect(shouldPreloadAllWarRoomsFromHome(desktop)).toBe(false);
  });

  it('preloads the remaining Blender rooms one-by-one in later desktop idle slots', async () => {
    const idleCallbacks = [];
    const windowRef = mobileWindow({
      innerWidth: 1440,
      matchMedia: vi.fn(() => ({ matches: true })),
      requestIdleCallback: vi.fn((callback) => {
        idleCallbacks.push(callback);
        return idleCallbacks.length;
      }),
    });
    const options = {
      windowRef,
      documentRef: { visibilityState: 'visible' },
      navigatorRef: { maxTouchPoints: 0, connection: { effectiveType: '4g', saveData: false } },
      boardRenderer: '3d',
    };

    const cancel = schedulePreferredWarRoomHomePreload(options);
    expect(idleCallbacks).toHaveLength(1);

    idleCallbacks.shift()();
    await vi.waitFor(() => expect(prefetchWarRoomVariant).toHaveBeenCalledWith('v3'));
    await vi.waitFor(() => expect(idleCallbacks).toHaveLength(1));

    idleCallbacks.shift()();
    await vi.waitFor(() => expect(prefetchWarRoomVariant).toHaveBeenCalledWith('v2'));
    await vi.waitFor(() => expect(idleCallbacks).toHaveLength(1));

    idleCallbacks.shift()();
    await vi.waitFor(() => expect(prefetchWarRoomVariant).toHaveBeenCalledWith('v4'));
    expect(prefetchWarRoomVariant.mock.calls.map(([variant]) => variant)).toEqual(['v3', 'v2', 'v4']);

    cancel();
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

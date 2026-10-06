import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  quickMatchLoaded: vi.fn(),
  preloadBoard3DRenderer: vi.fn(() => Promise.resolve({ default: () => null })),
  loadWarRoomVariant: vi.fn(() => 'v3'),
  prefetchWarRoomVariant: vi.fn(() => Promise.resolve(true)),
}));

vi.mock('./QuickMatchModal.jsx', () => {
  mocks.quickMatchLoaded();
  return { default: () => null };
});
vi.mock('./Board3DRegistration.js', () => ({
  preloadBoard3DRenderer: mocks.preloadBoard3DRenderer,
}));
vi.mock('./WarRoomVariant.js', () => ({
  loadWarRoomVariant: mocks.loadWarRoomVariant,
  prefetchWarRoomVariant: mocks.prefetchWarRoomVariant,
}));

import {
  loadQuickMatchReadyRoom,
  preloadQuickMatchReadyRoom,
  preloadWarRoomForPlayIntent,
  shouldPreloadWarRoomForPlayIntent,
} from './goldenPathPrefetch.js';

function windowRef() {
  return {};
}

describe('golden path intent prefetch', () => {
  beforeEach(() => {
    mocks.preloadBoard3DRenderer.mockClear();
    mocks.loadWarRoomVariant.mockClear();
    mocks.prefetchWarRoomVariant.mockClear();
  });

  it('deduplicates the Quick Match ready-room chunk across intent and React.lazy', async () => {
    await expect(preloadQuickMatchReadyRoom()).resolves.toBe(true);
    const [first, second] = await Promise.all([
      loadQuickMatchReadyRoom(),
      loadQuickMatchReadyRoom(),
    ]);

    expect(first.default).toBeTypeOf('function');
    expect(second).toBe(first);
    expect(mocks.quickMatchLoaded).toHaveBeenCalledTimes(1);
  });

  it('does not spend the 3D preload on 2D, data saver, slow links or hidden tabs', () => {
    const base = {
      windowRef: windowRef(),
      documentRef: { visibilityState: 'visible' },
      navigatorRef: { connection: { effectiveType: '4g', saveData: false } },
    };

    expect(shouldPreloadWarRoomForPlayIntent({ ...base, boardRenderer: '2d' })).toBe(false);
    expect(shouldPreloadWarRoomForPlayIntent({
      ...base,
      navigatorRef: { connection: { effectiveType: '4g', saveData: true } },
    })).toBe(false);
    expect(shouldPreloadWarRoomForPlayIntent({
      ...base,
      navigatorRef: { connection: { effectiveType: '2g', saveData: false } },
    })).toBe(false);
    expect(shouldPreloadWarRoomForPlayIntent({
      ...base,
      documentRef: { visibilityState: 'hidden' },
    })).toBe(false);
  });

  it('warms Board3D and the selected War Room only after 3D play intent', async () => {
    const options = {
      windowRef: windowRef(),
      documentRef: { visibilityState: 'visible' },
      navigatorRef: { connection: { effectiveType: '4g', saveData: false } },
      boardRenderer: '3d',
    };

    await expect(preloadWarRoomForPlayIntent(options)).resolves.toBe(true);
    await expect(preloadWarRoomForPlayIntent(options)).resolves.toBe(true);

    expect(mocks.preloadBoard3DRenderer).toHaveBeenCalledTimes(1);
    expect(mocks.loadWarRoomVariant).toHaveBeenCalledTimes(1);
    expect(mocks.prefetchWarRoomVariant).toHaveBeenCalledWith('v3');
  });
});

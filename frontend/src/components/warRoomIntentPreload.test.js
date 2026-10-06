import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  getBoardRenderer,
  preloadBoard3DRenderer,
  loadWarRoomVariant,
  prefetchWarRoomVariant,
} = vi.hoisted(() => ({
  getBoardRenderer: vi.fn(() => '3d'),
  preloadBoard3DRenderer: vi.fn(() => Promise.resolve({ default: () => null })),
  loadWarRoomVariant: vi.fn(() => 'v3'),
  prefetchWarRoomVariant: vi.fn(() => Promise.resolve(true)),
}));

vi.mock('../userPreferences.js', () => ({ getBoardRenderer }));
vi.mock('./Board3DRegistration.js', () => ({ preloadBoard3DRenderer }));
vi.mock('./WarRoomVariant.js', () => ({
  loadWarRoomVariant,
  prefetchWarRoomVariant,
}));

import {
  preloadPreferredWarRoomOnIntent,
  shouldPreloadPreferredWarRoomOnIntent,
} from './warRoomIntentPreload.js';

function browserRefs(overrides = {}) {
  return {
    windowRef: {},
    documentRef: { visibilityState: 'visible' },
    navigatorRef: { connection: { effectiveType: '4g', saveData: false } },
    boardRenderer: '3d',
    ...overrides,
  };
}

describe('War Room intent preload', () => {
  beforeEach(() => {
    getBoardRenderer.mockReset().mockReturnValue('3d');
    preloadBoard3DRenderer.mockReset().mockResolvedValue({ default: () => null });
    loadWarRoomVariant.mockReset().mockReturnValue('v3');
    prefetchWarRoomVariant.mockReset().mockResolvedValue(true);
  });

  it('does nothing until an explicit intent preload is requested', () => {
    const options = browserRefs();
    expect(shouldPreloadPreferredWarRoomOnIntent(options)).toBe(true);
    expect(preloadBoard3DRenderer).not.toHaveBeenCalled();
    expect(prefetchWarRoomVariant).not.toHaveBeenCalled();
  });

  it('warms the renderer and selected room after intent', async () => {
    await expect(preloadPreferredWarRoomOnIntent(browserRefs())).resolves.toBe(true);
    expect(preloadBoard3DRenderer).toHaveBeenCalledTimes(1);
    expect(loadWarRoomVariant).toHaveBeenCalledTimes(1);
    expect(prefetchWarRoomVariant).toHaveBeenCalledWith('v3');
  });

  it('does not spend 3D bandwidth on 2D, data saver or a slow link', async () => {
    await expect(preloadPreferredWarRoomOnIntent(browserRefs({ boardRenderer: '2d' }))).resolves.toBe(false);
    await expect(preloadPreferredWarRoomOnIntent(browserRefs({
      navigatorRef: { connection: { effectiveType: '4g', saveData: true } },
    }))).resolves.toBe(false);
    await expect(preloadPreferredWarRoomOnIntent(browserRefs({
      navigatorRef: { connection: { effectiveType: '2g', saveData: false } },
    }))).resolves.toBe(false);
    expect(preloadBoard3DRenderer).not.toHaveBeenCalled();
  });

  it('keeps speculative renderer failure harmless', async () => {
    preloadBoard3DRenderer.mockRejectedValueOnce(new Error('transient chunk failure'));
    await expect(preloadPreferredWarRoomOnIntent(browserRefs())).resolves.toBe(false);
  });
});

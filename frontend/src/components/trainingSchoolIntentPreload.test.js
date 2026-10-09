import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  getBoardRenderer,
  prefetchTutorialRoute,
  preloadBoard3DRenderer,
} = vi.hoisted(() => ({
  getBoardRenderer: vi.fn(() => '3d'),
  prefetchTutorialRoute: vi.fn(() => Promise.resolve(true)),
  preloadBoard3DRenderer: vi.fn(() => Promise.resolve({ default: () => null })),
}));

vi.mock('../userPreferences.js', () => ({ getBoardRenderer }));
vi.mock('../tutorialRoute.js', () => ({ prefetchTutorialRoute }));
vi.mock('./Board3DRegistration.js', () => ({ preloadBoard3DRenderer }));

import {
  preloadTrainingSchoolOnIntent,
  shouldPreloadTrainingSchoolOnIntent,
} from './trainingSchoolIntentPreload.js';

function browserRefs(overrides = {}) {
  return {
    windowRef: {},
    documentRef: { visibilityState: 'visible' },
    navigatorRef: { connection: { effectiveType: '4g', saveData: false } },
    ...overrides,
  };
}

describe('Training School intent preload', () => {
  beforeEach(() => {
    getBoardRenderer.mockReset().mockReturnValue('3d');
    prefetchTutorialRoute.mockReset().mockResolvedValue(true);
    preloadBoard3DRenderer.mockReset().mockResolvedValue({ default: () => null });
  });

  it('does nothing before explicit training intent', () => {
    expect(shouldPreloadTrainingSchoolOnIntent(browserRefs())).toBe(true);
    expect(prefetchTutorialRoute).not.toHaveBeenCalled();
    expect(preloadBoard3DRenderer).not.toHaveBeenCalled();
  });

  it('warms Tutorial, Board3D and the dedicated School Room shell on 3D intent', async () => {
    const loadSchoolRoomModule = vi.fn(() => Promise.resolve({ buildClassicWarRoomShell: vi.fn() }));

    await expect(preloadTrainingSchoolOnIntent({
      ...browserRefs(),
      boardRenderer: '3d',
      loadSchoolRoomModule,
    })).resolves.toBe(true);

    expect(prefetchTutorialRoute).toHaveBeenCalledTimes(1);
    expect(preloadBoard3DRenderer).toHaveBeenCalledTimes(1);
    expect(loadSchoolRoomModule).toHaveBeenCalledTimes(1);
  });

  it('warms only the Tutorial route when the user prefers 2D', async () => {
    const loadSchoolRoomModule = vi.fn();

    await expect(preloadTrainingSchoolOnIntent({
      ...browserRefs(),
      boardRenderer: '2d',
      loadSchoolRoomModule,
    })).resolves.toBe(true);

    expect(prefetchTutorialRoute).toHaveBeenCalledTimes(1);
    expect(preloadBoard3DRenderer).not.toHaveBeenCalled();
    expect(loadSchoolRoomModule).not.toHaveBeenCalled();
  });

  it.each([
    ['hidden tab', { documentRef: { visibilityState: 'hidden' } }],
    ['data saver', { navigatorRef: { connection: { effectiveType: '4g', saveData: true } } }],
    ['2g', { navigatorRef: { connection: { effectiveType: '2g', saveData: false } } }],
  ])('does not spend preload bandwidth on %s', async (_label, overrides) => {
    const loadSchoolRoomModule = vi.fn();

    await expect(preloadTrainingSchoolOnIntent({
      ...browserRefs(overrides),
      boardRenderer: '3d',
      loadSchoolRoomModule,
    })).resolves.toBe(false);

    expect(prefetchTutorialRoute).not.toHaveBeenCalled();
    expect(preloadBoard3DRenderer).not.toHaveBeenCalled();
    expect(loadSchoolRoomModule).not.toHaveBeenCalled();
  });

  it('keeps speculative 3D failures harmless once the route is warm', async () => {
    preloadBoard3DRenderer.mockRejectedValueOnce(new Error('transient Board3D preload failure'));
    const loadSchoolRoomModule = vi.fn(() => Promise.reject(new Error('transient shell preload failure')));

    await expect(preloadTrainingSchoolOnIntent({
      ...browserRefs(),
      boardRenderer: '3d',
      loadSchoolRoomModule,
    })).resolves.toBe(true);
  });
});

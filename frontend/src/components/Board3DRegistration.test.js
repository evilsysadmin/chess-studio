import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { registerBoard3D, lazy } = vi.hoisted(() => ({
  registerBoard3D: vi.fn(),
  lazy: vi.fn((loader) => ({ loader })),
}));

vi.mock('react', () => ({ lazy }));
vi.mock('./boardRendererRegistry.js', () => ({ registerBoard3D }));

describe('Board3D bootstrap boundary', () => {
  beforeEach(() => {
    vi.resetModules();
    registerBoard3D.mockClear();
    lazy.mockClear();
  });

  afterEach(() => vi.unstubAllGlobals());

  it('registers the lazy renderer without scheduling a download from Home', async () => {
    const requestIdleCallback = vi.fn();
    vi.stubGlobal('window', { requestIdleCallback });

    await import('./Board3DRegistration.js');

    expect(lazy).toHaveBeenCalledTimes(1);
    expect(registerBoard3D).toHaveBeenCalledTimes(1);
    expect(requestIdleCallback).not.toHaveBeenCalled();
  });
});

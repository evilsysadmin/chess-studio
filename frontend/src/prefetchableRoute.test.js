import { describe, expect, it, vi } from 'vitest';
import { createPrefetchableRoute } from './prefetchableRoute.js';

describe('prefetchable route', () => {
  it('stays cold until prefetch or navigation asks for the module', async () => {
    const loader = vi.fn(async () => ({ default: () => null }));
    const route = createPrefetchableRoute(loader);

    expect(loader).not.toHaveBeenCalled();

    await expect(route.prefetch()).resolves.toBe(true);
    expect(loader).toHaveBeenCalledTimes(1);

    await route.load();
    expect(loader).toHaveBeenCalledTimes(1);
  });

  it('lets the real route retry after a speculative preload failure', async () => {
    const loader = vi.fn()
      .mockRejectedValueOnce(new Error('transient chunk failure'))
      .mockResolvedValueOnce({ default: () => null });
    const route = createPrefetchableRoute(loader);

    await expect(route.prefetch()).resolves.toBe(false);
    await expect(route.load()).resolves.toEqual({ default: expect.any(Function) });
    expect(loader).toHaveBeenCalledTimes(2);
  });
});

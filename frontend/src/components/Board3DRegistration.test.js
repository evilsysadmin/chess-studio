import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { installWarRoomPointerCapture, registerBoard3D, lazy } = vi.hoisted(() => ({
  installWarRoomPointerCapture: vi.fn(),
  registerBoard3D: vi.fn(),
  lazy: vi.fn((loader) => ({ loader })),
}));

vi.mock('react', () => ({ lazy }));
vi.mock('./boardRendererRegistry.js', () => ({ registerBoard3D }));
vi.mock('./Board3D.jsx', () => ({ default: () => null }));
vi.mock('../warRoomPointerCapture.js', () => ({ installWarRoomPointerCapture }));

describe('Board3D bootstrap boundary', () => {
  beforeEach(() => {
    vi.resetModules();
    installWarRoomPointerCapture.mockClear();
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
    expect(installWarRoomPointerCapture).not.toHaveBeenCalled();
    expect(requestIdleCallback).not.toHaveBeenCalled();
  });

  it('installs War Room pointer recovery only when the 3D renderer is requested', async () => {
    await import('./Board3DRegistration.js');

    const registeredRenderer = registerBoard3D.mock.calls[0]?.[0];
    expect(registeredRenderer?.loader).toEqual(expect.any(Function));
    expect(installWarRoomPointerCapture).not.toHaveBeenCalled();

    await registeredRenderer.loader();

    expect(installWarRoomPointerCapture).toHaveBeenCalledTimes(1);
  });

  it('shares one in-flight 3D preload between quick-match warmup and the lazy mount', async () => {
    const module = await import('./Board3DRegistration.js');
    const registeredRenderer = registerBoard3D.mock.calls[0]?.[0];

    await Promise.all([
      module.preloadBoard3D(),
      module.preloadBoard3D(),
      registeredRenderer.loader(),
    ]);

    expect(installWarRoomPointerCapture).toHaveBeenCalledTimes(1);
  });
});

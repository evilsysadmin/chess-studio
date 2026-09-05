import { beforeEach, describe, expect, it, vi } from 'vitest';

const harness = vi.hoisted(() => ({
  cleanup: null,
  acquire: vi.fn(),
  release: vi.fn(),
}));

vi.mock('react', async () => {
  const actual = await vi.importActual('react');
  return {
    ...actual,
    useLayoutEffect: (effect) => {
      harness.cleanup = effect() || null;
    },
  };
});

vi.mock('./Board.jsx', async () => {
  const React = await vi.importActual('react');
  return { BoardRendererContext: React.createContext('2d') };
});

vi.mock('./Board3DCore.jsx', () => ({ default: () => null }));
vi.mock('./WarRoomHansIteration.js', () => ({
  acquireWarRoomHansQuickIteration: harness.acquire,
  releaseWarRoomHansQuickIteration: harness.release,
}));

import Board3D from './Board3D.jsx';

describe('Board3D Hans quick-iteration ownership', () => {
  beforeEach(() => {
    harness.cleanup = null;
    harness.acquire.mockClear();
    harness.release.mockClear();
  });

  it('mantiene el permiso de Hans durante toda la vida de la Partida rápida 3D', () => {
    Board3D({ hansFireplaceIteration: true });

    expect(harness.acquire).toHaveBeenCalledTimes(1);
    expect(harness.release).not.toHaveBeenCalled();
    expect(harness.cleanup).toBeTypeOf('function');

    harness.cleanup();
    expect(harness.release).toHaveBeenCalledTimes(1);
  });

  it('una vista 3D que no pide Hans no puede apagar el permiso de otra escena', () => {
    Board3D({ hansFireplaceIteration: false });
    Board3D({});

    expect(harness.acquire).not.toHaveBeenCalled();
    expect(harness.release).not.toHaveBeenCalled();
    expect(harness.cleanup).toBeNull();
  });
});

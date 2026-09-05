import { beforeEach, describe, expect, it, vi } from 'vitest';

const harness = vi.hoisted(() => ({
  cleanup: null,
  setQuickIteration: vi.fn(),
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
  setWarRoomHansQuickIterationEnabled: harness.setQuickIteration,
}));

import Board3D from './Board3D.jsx';

describe('Board3D Hans quick-iteration ownership', () => {
  beforeEach(() => {
    harness.cleanup = null;
    harness.setQuickIteration.mockClear();
  });

  it('mantiene Hans forzado durante toda la vida de la War Room rápida', () => {
    Board3D({ hansFireplaceIteration: true });

    expect(harness.setQuickIteration).toHaveBeenCalledTimes(1);
    expect(harness.setQuickIteration).toHaveBeenLastCalledWith(true);
    expect(harness.cleanup).toBeTypeOf('function');

    harness.cleanup();
    expect(harness.setQuickIteration).toHaveBeenCalledTimes(2);
    expect(harness.setQuickIteration).toHaveBeenLastCalledWith(false);
  });

  it('una vista 3D que no pide Hans no puede apagar la escena que lo posee', () => {
    Board3D({ hansFireplaceIteration: false });
    Board3D({});

    expect(harness.setQuickIteration).not.toHaveBeenCalled();
    expect(harness.cleanup).toBeNull();
  });
});

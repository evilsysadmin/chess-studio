import { beforeEach, describe, expect, it, vi } from 'vitest';

const harness = vi.hoisted(() => ({
  cleanup: null,
  marker: null,
  acquire: vi.fn(),
  release: vi.fn(),
  hasCompleted: vi.fn(() => false),
}));

vi.mock('react', async () => {
  const actual = await vi.importActual('react');
  return {
    ...actual,
    useLayoutEffect: (effect) => {
      harness.cleanup = effect() || null;
    },
    useRef: () => ({ current: harness.marker }),
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
vi.mock('./WarRoomHansPerGame.js', () => ({
  hasWarRoomHansCompletedForGame: harness.hasCompleted,
}));

import Board3D from './Board3D.jsx';

describe('Board3D Hans quick-iteration ownership', () => {
  beforeEach(() => {
    harness.cleanup = null;
    harness.marker = null;
    harness.acquire.mockClear();
    harness.release.mockClear();
    harness.hasCompleted.mockReset();
    harness.hasCompleted.mockReturnValue(false);
  });

  it('mantiene el lease de Hans durante una secuencia todavía no completada', () => {
    Board3D({ hansFireplaceIteration: true, gameId: 'game-1' });

    expect(harness.hasCompleted).toHaveBeenCalledWith('game-1');
    expect(harness.acquire).toHaveBeenCalledTimes(1);
    expect(harness.release).not.toHaveBeenCalled();
    expect(harness.cleanup).toBeTypeOf('function');

    harness.cleanup();
    expect(harness.release).toHaveBeenCalledTimes(1);
  });

  it('un montaje transitorio no puede completar el número', () => {
    Board3D({ hansFireplaceIteration: true, gameId: 'game-transient' });
    expect(harness.acquire).toHaveBeenCalledTimes(1);
    harness.cleanup();

    harness.cleanup = null;
    Board3D({ hansFireplaceIteration: true, gameId: 'game-transient' });

    expect(harness.hasCompleted).toHaveBeenCalledTimes(2);
    expect(harness.acquire).toHaveBeenCalledTimes(2);
    expect(harness.cleanup).toBeTypeOf('function');
  });

  it('Hans visible y onscreen sigue sin completar el número desde Board3D', () => {
    harness.marker = {
      getAttribute: (name) => ({
        'data-war-room-hans-runtime': 'visible',
        'data-war-room-hans-screen': 'onscreen',
      })[name] ?? null,
    };

    Board3D({ hansFireplaceIteration: true, gameId: 'game-onscreen' });

    expect(harness.hasCompleted).toHaveBeenCalledWith('game-onscreen');
    expect(harness.acquire).toHaveBeenCalledTimes(1);
    expect(harness.release).not.toHaveBeenCalled();
  });

  it('no rearma a Hans cuando esa misma partida ya completó el número', () => {
    harness.hasCompleted.mockReturnValue(true);
    Board3D({ hansFireplaceIteration: true, gameId: 'game-complete' });

    expect(harness.hasCompleted).toHaveBeenCalledWith('game-complete');
    expect(harness.acquire).not.toHaveBeenCalled();
    expect(harness.release).not.toHaveBeenCalled();
    expect(harness.cleanup).toBeNull();
  });

  it('una vista 3D que no pide Hans no puede apagar el permiso de otra escena', () => {
    Board3D({ hansFireplaceIteration: false, gameId: 'game-2' });
    Board3D({ gameId: 'game-2' });

    expect(harness.hasCompleted).not.toHaveBeenCalled();
    expect(harness.acquire).not.toHaveBeenCalled();
    expect(harness.release).not.toHaveBeenCalled();
    expect(harness.cleanup).toBeNull();
  });
});

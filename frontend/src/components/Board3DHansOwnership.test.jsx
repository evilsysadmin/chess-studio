import { beforeEach, describe, expect, it, vi } from 'vitest';

const harness = vi.hoisted(() => ({
  cleanup: null,
  marker: null,
  acquire: vi.fn(),
  release: vi.fn(),
  hasSeen: vi.fn(() => false),
  markSeen: vi.fn(),
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
  hasWarRoomHansAppearedForGame: harness.hasSeen,
  markWarRoomHansAppearedForGame: harness.markSeen,
}));

import Board3D from './Board3D.jsx';

describe('Board3D Hans quick-iteration ownership', () => {
  beforeEach(() => {
    harness.cleanup = null;
    harness.marker = null;
    harness.acquire.mockClear();
    harness.release.mockClear();
    harness.hasSeen.mockReset();
    harness.hasSeen.mockReturnValue(false);
    harness.markSeen.mockClear();
  });

  it('mantiene el permiso de Hans durante toda la vida de una partida todavía no vista', () => {
    Board3D({ hansFireplaceIteration: true, gameId: 'game-1' });

    expect(harness.hasSeen).toHaveBeenCalledWith('game-1');
    expect(harness.acquire).toHaveBeenCalledTimes(1);
    expect(harness.markSeen).not.toHaveBeenCalled();
    expect(harness.release).not.toHaveBeenCalled();
    expect(harness.cleanup).toBeTypeOf('function');

    harness.cleanup();
    expect(harness.release).toHaveBeenCalledTimes(1);
  });

  it('un montaje transitorio que nunca pinta a Hans no consume el cameo', () => {
    Board3D({ hansFireplaceIteration: true, gameId: 'game-transient' });
    expect(harness.acquire).toHaveBeenCalledTimes(1);
    expect(harness.markSeen).not.toHaveBeenCalled();
    harness.cleanup();

    harness.cleanup = null;
    Board3D({ hansFireplaceIteration: true, gameId: 'game-transient' });

    expect(harness.hasSeen).toHaveBeenCalledTimes(2);
    expect(harness.acquire).toHaveBeenCalledTimes(2);
    expect(harness.markSeen).not.toHaveBeenCalled();
    expect(harness.cleanup).toBeTypeOf('function');
  });

  it('consume el cameo sólo cuando Hans está visible y dentro del viewport', () => {
    harness.marker = {
      getAttribute: (name) => ({
        'data-war-room-hans-runtime': 'visible',
        'data-war-room-hans-screen': 'onscreen',
      })[name] ?? null,
    };

    Board3D({ hansFireplaceIteration: true, gameId: 'game-seen-now' });

    expect(harness.acquire).toHaveBeenCalledTimes(1);
    expect(harness.markSeen).toHaveBeenCalledTimes(1);
    expect(harness.markSeen).toHaveBeenCalledWith('game-seen-now');
  });

  it('no rearma a Hans cuando esa misma partida ya confirmó el cameo', () => {
    harness.hasSeen.mockReturnValue(true);
    Board3D({ hansFireplaceIteration: true, gameId: 'game-seen' });

    expect(harness.hasSeen).toHaveBeenCalledWith('game-seen');
    expect(harness.acquire).not.toHaveBeenCalled();
    expect(harness.markSeen).not.toHaveBeenCalled();
    expect(harness.release).not.toHaveBeenCalled();
    expect(harness.cleanup).toBeNull();
  });

  it('una vista 3D que no pide Hans no puede apagar el permiso de otra escena', () => {
    Board3D({ hansFireplaceIteration: false, gameId: 'game-2' });
    Board3D({ gameId: 'game-2' });

    expect(harness.hasSeen).not.toHaveBeenCalled();
    expect(harness.acquire).not.toHaveBeenCalled();
    expect(harness.markSeen).not.toHaveBeenCalled();
    expect(harness.release).not.toHaveBeenCalled();
    expect(harness.cleanup).toBeNull();
  });
});

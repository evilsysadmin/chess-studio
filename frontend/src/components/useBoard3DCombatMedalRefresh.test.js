import { beforeEach, describe, expect, it, vi } from 'vitest';

const harness = vi.hoisted(() => ({
  dependencies: null,
  sync: vi.fn(),
}));

vi.mock('react', async () => {
  const actual = await vi.importActual('react');
  return {
    ...actual,
    useEffect: (effect, deps) => {
      const changed = !harness.dependencies
        || deps.some((item, index) => item !== harness.dependencies[index]);
      harness.dependencies = deps;
      if (changed) effect();
    },
  };
});

vi.mock('./Board3DRankInsignia.js', () => ({
  syncBoard3DRankInsignias: harness.sync,
}));

import useBoard3DCombatMedalRefresh from './useBoard3DCombatMedalRefresh.js';

function fixture() {
  const state = { requestRender: vi.fn(), pieceMeshes: new Map() };
  return {
    sceneStateRef: { current: state },
    animationFrameRef: { current: 0 },
    warRoomVariant: 'combat-ops',
    pieceRankLevels: { a2: 2 },
    pieceMedalCounts: { a2: 1 },
  };
}

describe('Combat Operations 3D honours refresh', () => {
  beforeEach(() => {
    harness.dependencies = null;
    harness.sync.mockReset();
  });

  it('refreshes on a rank-only change without a FEN or medals change', () => {
    const props = fixture();
    useBoard3DCombatMedalRefresh(props);
    expect(harness.sync).toHaveBeenCalledTimes(1);
    expect(props.sceneStateRef.current.requestRender).toHaveBeenCalledTimes(1);
    useBoard3DCombatMedalRefresh(props);
    expect(harness.sync).toHaveBeenCalledTimes(1);

    useBoard3DCombatMedalRefresh({ ...props, pieceRankLevels: { a2: 3 } });
    expect(harness.sync).toHaveBeenCalledTimes(2);
    expect(props.sceneStateRef.current.requestRender).toHaveBeenCalledTimes(2);
  });

  it('refreshes when only earned medals change', () => {
    const props = fixture();
    useBoard3DCombatMedalRefresh(props);
    useBoard3DCombatMedalRefresh({ ...props, pieceMedalCounts: { a2: 3 } });
    expect(harness.sync).toHaveBeenCalledTimes(2);
  });

  it('does not decorate other variants or interrupt an active animation', () => {
    const props = fixture();
    useBoard3DCombatMedalRefresh({ ...props, warRoomVariant: 'v3' });
    expect(harness.sync).not.toHaveBeenCalled();
    harness.dependencies = null;
    useBoard3DCombatMedalRefresh({ ...props, animationFrameRef: { current: 1 } });
    expect(harness.sync).not.toHaveBeenCalled();
  });
});

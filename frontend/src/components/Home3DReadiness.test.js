import { describe, expect, it } from 'vitest';
import { home3DFrameReady } from './Home3DReadiness.js';

function stage({ ready = false, compositor = 'blender-runtime', runtime = 'loading', width = 600 } = {}) {
  return {
    querySelector: () => ({
      classList: { contains: (name) => name === 'is-ready' && ready },
      width,
      height: width,
      dataset: { homeCastleCompositor: compositor, homeBlenderRuntime: runtime },
    }),
  };
}

describe('atomic Home 3D reveal', () => {
  it('does not accept an unpainted or recovering Blender canvas', () => {
    expect(home3DFrameReady(null)).toBe(false);
    expect(home3DFrameReady(stage())).toBe(false);
    expect(home3DFrameReady(stage({ ready: true }))).toBe(false);
    expect(home3DFrameReady(stage({ ready: true, runtime: 'recovering' }))).toBe(false);
    expect(home3DFrameReady(stage({ ready: true, runtime: 'ready', width: 0 }))).toBe(false);
  });
  it('reveals painted Blender or legacy 3D, not a prematurely mounted frame', () => {
    expect(home3DFrameReady(stage({ ready: true, runtime: 'ready' }))).toBe(true);
    expect(home3DFrameReady(stage({ ready: false, compositor: 'layered' }))).toBe(false);
    expect(home3DFrameReady(stage({ ready: true, compositor: 'layered' }))).toBe(true);
  });
});

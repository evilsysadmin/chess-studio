import { describe, expect, it } from 'vitest';
import { home3DFrameReady, home3DContextRecovering, home3DShouldPreserveCanvas } from './Home3DReadiness.js';

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

describe('recoverable Home WebGL context loss', () => {
  it('protects the surviving canvas from the irreversible startup fallback', () => {
    expect(home3DContextRecovering(null)).toBe(false);
    expect(home3DContextRecovering({ querySelector: () => null })).toBe(false);
    expect(home3DContextRecovering(stage({ runtime: 'loading' }))).toBe(false);
    expect(home3DContextRecovering(stage({ ready: true, runtime: 'ready' }))).toBe(false);
    expect(home3DContextRecovering(stage({ runtime: 'recovering' }))).toBe(true);
  });
});


describe('WebGL recovery may be preparing its replacement renderer at the watchdog deadline', () => {
  it('preserves an already-composed 3D scene after recovering becomes loading again', () => {
    expect(home3DShouldPreserveCanvas(stage({ runtime: 'recovering' }))).toBe(true);
    // The existing #6163 guard alone returned false here and could make the
    // 30 s timer unmount a renderer that had just begun rebuilding its GLB.
    expect(home3DShouldPreserveCanvas(stage({ runtime: 'loading' }), {
      everPresented3D: true,
    })).toBe(true);
    expect(home3DShouldPreserveCanvas(stage({ runtime: 'ready' }), {
      everPresented3D: true,
    })).toBe(true);
    expect(home3DShouldPreserveCanvas(null, { everPresented3D: true })).toBe(true);
  });

  it('keeps the real 30 s cold-start fallback when no frame has ever composed', () => {
    expect(home3DShouldPreserveCanvas(null)).toBe(false);
    expect(home3DShouldPreserveCanvas(stage({ runtime: 'loading' }))).toBe(false);
    expect(home3DShouldPreserveCanvas(stage({ runtime: 'ready' }))).toBe(false);
  });
});

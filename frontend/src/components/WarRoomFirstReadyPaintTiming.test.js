import { describe, expect, it } from 'vitest';
import { beginWarRoomFirstReadyPaintTiming } from './WarRoomFirstReadyPaintTiming.js';

describe('War Room first ready-frame timing', () => {
  it('samples the real GL draw separately from post-render diagnostics once', () => {
    const dataset = { warRoomVariantStatus: 'ready' };
    let clock = 100;
    const capture = beginWarRoomFirstReadyPaintTiming({ dataset }, () => clock);
    expect(capture).not.toBeNull();
    clock = 137.8;
    capture.afterRender();
    clock = 144.1;
    capture.afterDiagnostics();
    expect(dataset.warRoomShellTimingRenderMs).toBe('38');
    expect(dataset.warRoomShellTimingPostRenderMs).toBe('6');
    expect(beginWarRoomFirstReadyPaintTiming({ dataset }, () => 200)).toBeNull();
  });

  it('does not instrument classic, loading or already-accounted frames', () => {
    expect(beginWarRoomFirstReadyPaintTiming()).toBeNull();
    expect(beginWarRoomFirstReadyPaintTiming({ dataset: { warRoomVariantStatus: 'idle' } })).toBeNull();
    expect(beginWarRoomFirstReadyPaintTiming({ dataset: { warRoomVariantStatus: 'loading' } })).toBeNull();
    expect(beginWarRoomFirstReadyPaintTiming({ dataset: {
      warRoomVariantStatus: 'ready', warRoomShellTimingReadyPaintMs: '80',
    } })).toBeNull();
  });

  it('ignores post-diagnostics before draw and allows a fresh variant', () => {
    let clock = 2;
    const dataset = { warRoomVariantStatus: 'ready' };
    const first = beginWarRoomFirstReadyPaintTiming({ dataset }, () => clock);
    first.afterDiagnostics();
    expect(dataset.warRoomShellTimingPostRenderMs).toBeUndefined();
    clock = 5;
    first.afterRender();
    clock = 7;
    first.afterDiagnostics();
    expect(dataset.warRoomShellTimingRenderMs).toBe('3');
    expect(dataset.warRoomShellTimingPostRenderMs).toBe('2');
    delete dataset.warRoomShellTimingReadyPaintMs;
    delete dataset.warRoomShellTimingRenderMs;
    delete dataset.warRoomShellTimingPostRenderMs;
    expect(beginWarRoomFirstReadyPaintTiming({ dataset }, () => 9)).not.toBeNull();
  });
});

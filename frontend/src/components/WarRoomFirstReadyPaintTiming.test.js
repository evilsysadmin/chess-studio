import { describe, expect, it } from 'vitest';
import { beginWarRoomFirstReadyPaintTiming } from './WarRoomFirstReadyPaintTiming.js';

describe('War Room first ready-frame timing', () => {
  it('samples the real GL draw separately from post-render diagnostics once', () => {
    const dataset = { warRoomVariantStatus: 'ready' };
    let clock = 100;
    const capture = beginWarRoomFirstReadyPaintTiming({ dataset }, () => clock);
    expect(capture).not.toBeNull();
    clock = 137.8;
    capture.afterRender({ calls: 417, triangles: 194321, lines: 9, points: 0 });
    clock = 144.1;
    capture.afterDiagnostics();
    expect(dataset.warRoomShellTimingRenderMs).toBe('38');
    expect(dataset.warRoomFirstReadyRenderCalls).toBe('417');
    expect(dataset.warRoomFirstReadyRenderTriangles).toBe('194321');
    expect(dataset.warRoomFirstReadyRenderLines).toBe('9');
    expect(dataset.warRoomFirstReadyRenderPoints).toBe('0');
    capture.afterRender({ calls: 999 });
    expect(dataset.warRoomFirstReadyRenderCalls).toBe('417');
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

  it('does not fabricate WebGL counters when render info is absent or invalid', () => {
    const absent = { dataset: { warRoomVariantStatus: 'ready' } };
    beginWarRoomFirstReadyPaintTiming(absent, () => 1).afterRender();
    expect(absent.dataset.warRoomFirstReadyRenderCalls).toBeUndefined();
    const invalid = { dataset: { warRoomVariantStatus: 'ready' } };
    beginWarRoomFirstReadyPaintTiming(invalid, () => 1).afterRender({
      calls: Infinity, triangles: -1, points: 1.5, lines: 3,
    });
    expect(invalid.dataset.warRoomFirstReadyRenderCalls).toBeUndefined();
    expect(invalid.dataset.warRoomFirstReadyRenderTriangles).toBeUndefined();
    expect(invalid.dataset.warRoomFirstReadyRenderPoints).toBeUndefined();
    expect(invalid.dataset.warRoomFirstReadyRenderLines).toBe('3');
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

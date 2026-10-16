import { describe, expect, it } from 'vitest';
import { createWarRoomShellTiming, WAR_ROOM_SHELL_TIMING_PHASES } from './WarRoomShellTiming.js';

describe('War Room Blender shell timing', () => {
  it('reports independent phases, not cumulative durations, without per-frame DOM writes', () => {
    let clock = 100;
    const dataset = {};
    const timing = createWarRoomShellTiming({ canvas: { dataset }, now: () => clock });
    const steps = [5.49, 37.51, 3.9, 8, 92];
    for (const [index, phase] of WAR_ROOM_SHELL_TIMING_PHASES.entries()) {
      clock += steps[index];
      expect(timing.mark(phase)).toBe(Math.round(steps[index]));
    }
    expect(dataset).toEqual({
      warRoomShellTimingImportMs: '5',
      warRoomShellTimingGlbMs: '38',
      warRoomShellTimingMaterialsMs: '4',
      warRoomShellTimingEffectsMs: '8',
      warRoomShellTimingReadyPaintMs: '92',
    });
    expect(timing.mark('bogus')).toBeNull();
    timing.dispose();
    expect(timing.mark('glb')).toBeNull();
  });

  it('removes stale stage counters on variant switch and tolerates absent canvas', () => {
    const canvas = { dataset: {
      warRoomShellTimingGlbMs: '900',
      warRoomShellTimingReadyPaintMs: '30',
      unrelatedMetric: 'keep',
    } };
    const timing = createWarRoomShellTiming({ canvas, now: () => 1 });
    expect(canvas.dataset).toEqual({ unrelatedMetric: 'keep' });
    timing.mark('glb');
    expect(canvas.dataset.warRoomShellTimingGlbMs).toBe('0');
    expect(createWarRoomShellTiming({ now: () => 10 }).mark('glb')).toBe(0);
  });
});

import { describe, expect, it } from 'vitest';
import {
  hansQuickIterationFrame,
  writeHansQuickIterationFrame,
} from './WarRoomHansIteration.js';

describe('Hans quick-iteration hot path', () => {
  it('reutiliza el mismo frame sin contaminar fases posteriores', () => {
    const scratch = {};
    const samples = [0, 8.2, 13.6, 19.5, 29, 30.1];

    for (const elapsed of samples) {
      const frame = writeHansQuickIterationFrame(scratch, elapsed, false);
      expect(frame).toBe(scratch);
      const expected = hansQuickIterationFrame(elapsed);
      for (const key of Object.keys(expected)) {
        expect(frame[key]).toEqual(expected[key]);
      }
    }

    expect(scratch.complete).toBe(true);
    expect(scratch.hansVisible).toBe(false);
    expect(scratch.carryLog).toBe(false);
    expect(scratch.carryPoker).toBe(false);
    expect(scratch.doorOpen).toBe(0);
    expect(scratch.choreography).toBe('complete');
  });

  it('mantiene el mismo writer para la entrada táctil visible', () => {
    const scratch = {};
    const frame = writeHansQuickIterationFrame(scratch, 0, true);
    const expected = hansQuickIterationFrame(0, { coarsePointer: true });

    expect(frame).toBe(scratch);
    expect(frame.phase).toBe(expected.phase);
    expect(frame.hansVisible).toBe(true);
    expect(frame.hansX).toBeCloseTo(expected.hansX, 8);
    expect(frame.routeProgress).toBeCloseTo(expected.routeProgress, 8);
    expect(frame.doorOpen).toBe(expected.doorOpen);
    expect(frame.facingTarget).toBe(expected.facingTarget);
  });
});

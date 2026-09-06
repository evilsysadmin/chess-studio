import { describe, expect, it } from 'vitest';
import {
  chesscomAimYaw,
  chesscomCanonicalShotTimeline,
  chesscomUnitVisualProfile,
} from './chesscomUnitCombatCanonical.js';

describe('Chesscom canonical unit identity', () => {
  it('keeps Matthias visually distinct from generic mercenaries', () => {
    expect(chesscomUnitVisualProfile('matthias', true, 'ultra')).toMatchObject({
      identity:'matthias',
      role:'leader',
      roundedArms:false,
    });
    expect(chesscomUnitVisualProfile('dieter', true, 'ultra')).toMatchObject({
      identity:'rifleman-mercenary',
      role:'rifleman',
      roundedArms:true,
    });
    expect(chesscomUnitVisualProfile('sven', true, 'ultra')).toMatchObject({
      identity:'scout-mercenary',
      role:'scout',
      roundedArms:true,
    });
  });

  it('keeps hostile contractors visually separate from the player squad', () => {
    const hostile = chesscomUnitVisualProfile('guard-a', false, 'ultra');
    expect(hostile.identity).toBe('hostile-mercenary');
    expect(hostile.accent).not.toBe(chesscomUnitVisualProfile('dieter', true, 'ultra').accent);
  });
});

describe('Chesscom canonical fire stance', () => {
  it('aims the authored +X weapon axis toward cardinal world directions', () => {
    expect(chesscomAimYaw({ x:0,z:0 }, { x:5,z:0 })).toBeCloseTo(0, 6);
    expect(chesscomAimYaw({ x:0,z:0 }, { x:0,z:5 })).toBeCloseTo(-Math.PI / 2, 6);
    expect(Math.abs(chesscomAimYaw({ x:0,z:0 }, { x:-5,z:0 }))).toBeCloseTo(Math.PI, 6);
  });

  it('uses the aim window to replace torso tracers without delaying the registered impact', () => {
    const first = chesscomCanonicalShotTimeline(5, 0, false);
    const second = chesscomCanonicalShotTimeline(5, 1, false);
    expect(first.aimMs).toBe(55);
    expect(first.bornMs + first.flightMs).toBe(first.impactMs);
    expect(second.impactMs - first.impactMs).toBe(44);
    expect(first.flightMs).toBeGreaterThanOrEqual(58);
  });

  it('keeps constrained/mobile timing bounded while preserving an aiming beat', () => {
    const shot = chesscomCanonicalShotTimeline(4, 0, true);
    expect(shot.aimMs).toBe(48);
    expect(shot.flightMs).toBeGreaterThan(shot.aimMs);
    expect(shot.impactMs).toBeGreaterThan(shot.bornMs);
  });
});

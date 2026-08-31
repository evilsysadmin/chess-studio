import { describe, expect, it } from 'vitest';
import {
  TRAIL_BISHOP_RECOIL_MS,
  TRAIL_KNIGHT_JUMP_MS,
  TRAIL_ROOK_CHARGE_MS,
  trailAnimationProgress,
  trailBishopRecoilPose,
  trailKnightJumpPose,
  trailPlayerLift,
  trailRookChargePose,
} from './pawnTrailblazerAnimation.js';

describe('Pawn Trailblazer physical animation', () => {
  it('normaliza el progreso temporal y lo limita a la ventana de animación', () => {
    expect(trailAnimationProgress(100, 0, 500)).toBe(1);
    expect(trailAnimationProgress(100, 100, 500)).toBe(0);
    expect(trailAnimationProgress(350, 100, 500)).toBeCloseTo(0.5);
    expect(trailAnimationProgress(900, 100, 500)).toBe(1);
  });

  it('hace que el caballo despegue, alcance un ápice y aterrice', () => {
    const start = trailKnightJumpPose(1_000, 1_000, false);
    const apex = trailKnightJumpPose(1_000 + TRAIL_KNIGHT_JUMP_MS / 2, 1_000, false);
    const end = trailKnightJumpPose(1_000 + TRAIL_KNIGHT_JUMP_MS, 1_000, false);
    expect(start.lift).toBeCloseTo(0);
    expect(apex.lift).toBeGreaterThan(0.95);
    expect(end.lift).toBeCloseTo(0);
    expect(end.active).toBe(false);
  });

  it('mantiene carga de torre y retroceso de alfil acotados en el tiempo', () => {
    const rook = trailRookChargePose(2_000 + TRAIL_ROOK_CHARGE_MS / 2, 2_000, false);
    expect(rook.active).toBe(true);
    expect(Math.abs(rook.y)).toBeGreaterThan(0.01);

    const bishop = trailBishopRecoilPose(3_000 + TRAIL_BISHOP_RECOIL_MS / 2, 3_000, false);
    expect(bishop.active).toBe(true);
    expect(Math.abs(bishop.rotation)).toBeGreaterThan(0.03);
    expect(bishop.flash).toBeGreaterThanOrEqual(0);
  });

  it('sube a Matthias sólo en viewports estrechos para librarlo de los controles táctiles', () => {
    expect(trailPlayerLift(1024, 700)).toBe(0);
    expect(trailPlayerLift(390, 560)).toBeGreaterThanOrEqual(62);
    expect(trailPlayerLift(390, 900)).toBeLessThanOrEqual(92);
  });

  it('reduce amplitud física sin congelarla cuando el usuario pide menos movimiento', () => {
    const full = trailKnightJumpPose(1_000 + TRAIL_KNIGHT_JUMP_MS / 2, 1_000, false);
    const reduced = trailKnightJumpPose(1_000 + TRAIL_KNIGHT_JUMP_MS / 2, 1_000, true);
    expect(reduced.lift).toBeGreaterThan(0);
    expect(reduced.lift).toBeLessThan(full.lift);
  });
});

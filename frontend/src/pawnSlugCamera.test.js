import { describe, expect, it } from 'vitest';
import { PAWN_SLUG_CAMERA_META, pawnSlugCameraLookAhead } from './pawnSlugCamera.js';

const VIEW_W = 29.5;
const PLAYER_SPEED = 5.1;

function lead(vx, dir = 1) {
  return pawnSlugCameraLookAhead({ vx, dir, viewWidth: VIEW_W, playerSpeed: PLAYER_SPEED });
}

describe('Pawn Slug directional camera look-ahead', () => {
  it('keeps a small facing bias while stopped', () => {
    expect(lead(0, 1)).toBeCloseTo(VIEW_W * PAWN_SLUG_CAMERA_META.idleLeadRightRatio, 5);
    expect(lead(0, -1)).toBeCloseTo(-VIEW_W * PAWN_SLUG_CAMERA_META.idleLeadLeftRatio, 5);
  });

  it('ignores tiny velocity noise inside the deadzone', () => {
    const tiny = PLAYER_SPEED * PAWN_SLUG_CAMERA_META.speedDeadzoneRatio * 0.8;
    expect(lead(tiny, 1)).toBeCloseTo(lead(0, 1), 5);
    expect(lead(-tiny, -1)).toBeCloseTo(lead(0, -1), 5);
  });

  it('opens more space ahead at running speed in either direction', () => {
    expect(lead(PLAYER_SPEED, 1)).toBeCloseTo(VIEW_W * PAWN_SLUG_CAMERA_META.maxLeadRightRatio, 5);
    expect(lead(-PLAYER_SPEED, -1)).toBeCloseTo(-VIEW_W * PAWN_SLUG_CAMERA_META.maxLeadLeftRatio, 5);
  });

  it('clamps overspeed so recoil or external impulses cannot oversteer the camera', () => {
    expect(lead(PLAYER_SPEED * 3, 1)).toBeCloseTo(lead(PLAYER_SPEED, 1), 5);
    expect(lead(-PLAYER_SPEED * 3, -1)).toBeCloseTo(lead(-PLAYER_SPEED, -1), 5);
  });

  it('uses actual movement direction once velocity leaves zero', () => {
    expect(lead(-PLAYER_SPEED, 1)).toBeLessThan(0);
    expect(lead(PLAYER_SPEED, -1)).toBeGreaterThan(0);
  });
});

import { describe, expect, it } from 'vitest';
import {
  CHESSCOM_MATTHIAS_OPERATIVE_PROFILE,
  chesscomMoveCostLabel,
  chesscomMovementDuration,
  chesscomMovementEase,
  chesscomMovementLift,
  chesscomMuzzleWorldPosition,
  chesscomOperativeMovementLift,
} from './chesscomBabylonPremium.js';

describe('Chesscom Babylon tactical movement', () => {
  it('uses a bounded easing curve with exact endpoints and soft acceleration', () => {
    expect(chesscomMovementEase(-1)).toBe(0);
    expect(chesscomMovementEase(0)).toBe(0);
    expect(chesscomMovementEase(.5)).toBe(.5);
    expect(chesscomMovementEase(1)).toBe(1);
    expect(chesscomMovementEase(2)).toBe(1);
    expect(chesscomMovementEase(.1)).toBeLessThan(.02);
    expect(chesscomMovementEase(.25)).toBeLessThan(.25);
    expect(chesscomMovementEase(.75)).toBeGreaterThan(.75);
    expect(chesscomMovementEase(.9)).toBeGreaterThan(.98);
  });

  it('keeps tactical travel readable instead of snapping units across the board', () => {
    const oneTile = chesscomMovementDuration(1.55);
    const threeTiles = chesscomMovementDuration(4.65);
    expect(oneTile).toBeGreaterThanOrEqual(600);
    expect(oneTile).toBeLessThan(800);
    expect(threeTiles).toBeGreaterThan(oneTile);
    expect(threeTiles).toBeLessThanOrEqual(1180);
  });

  it('adds restrained footfalls without leaving the unit floating at either endpoint', () => {
    expect(chesscomMovementLift(0, 2)).toBe(0);
    expect(chesscomMovementLift(1, 2)).toBe(0);
    expect(chesscomMovementLift(.25, 2)).toBeGreaterThan(.04);
    expect(chesscomMovementLift(.75, 2)).toBeGreaterThan(.04);
    expect(chesscomMovementLift(.25, 2)).toBeLessThan(.07);
  });

  it('moves operative Matthias with articulated legs instead of pawn hopping', () => {
    const genericLift = chesscomMovementLift(.25, 2);
    const operativeLift = chesscomOperativeMovementLift(.25, 2);
    expect(operativeLift).toBeGreaterThan(0);
    expect(operativeLift).toBeLessThan(genericLift * .15);
    expect(chesscomOperativeMovementLift(0, 2)).toBe(0);
    expect(chesscomOperativeMovementLift(1, 2)).toBe(0);
  });

  it('locks the approved Matthias Chesscom identity to a visible pawn-core exosuit', () => {
    expect(CHESSCOM_MATTHIAS_OPERATIVE_PROFILE).toMatchObject({
      identity: 'pawn-core-exosuit',
      locomotion: 'articulated-operative',
      pawnCoreVisible: true,
      face: 'canonical-matthias',
      cap: 'canonical-peaked-cap',
    });
    expect(CHESSCOM_MATTHIAS_OPERATIVE_PROFILE.palette).toEqual(['ivory', 'black', 'brass', 'oxblood']);
  });

  it('formats movement costs as explicit AP labels', () => {
    expect(chesscomMoveCostLabel(1)).toBe('1 AP');
    expect(chesscomMoveCostLabel(2)).toBe('2 AP');
    expect(chesscomMoveCostLabel(3)).toBe('3 AP');
  });

  it('transforms the stored weapon muzzle into world space instead of firing from the unit centre', () => {
    let computed = 0;
    const root = {
      metadata:{ muzzle:{ x:1, y:2, z:3 } },
      computeWorldMatrix(){ computed += 1; },
      getWorldMatrix(){ return { dx:10, dy:20, dz:30 }; },
    };
    const B = {
      Vector3:{
        TransformCoordinates(vector, matrix) {
          return { x:vector.x + matrix.dx, y:vector.y + matrix.dy, z:vector.z + matrix.dz };
        },
      },
    };
    const fallback = { clone:() => ({ fallback:true }) };
    expect(chesscomMuzzleWorldPosition(B, root, fallback)).toEqual({ x:11, y:22, z:33 });
    expect(computed).toBe(1);
  });

  it('falls back safely when a legacy unit has no muzzle metadata', () => {
    const fallback = { clone:() => ({ x:4, y:5, z:6 }) };
    expect(chesscomMuzzleWorldPosition({}, null, fallback)).toEqual({ x:4, y:5, z:6 });
  });
});

import { describe, expect, it } from 'vitest';
import {
  chesscomMoveCostLabel,
  chesscomMovementDuration,
  chesscomMovementEase,
  chesscomMovementLift,
  chesscomMuzzleWorldPosition,
} from './chesscomBabylonPremium.js';

describe('Chesscom Babylon tactical movement', () => {
  it('uses a bounded easing curve with exact endpoints', () => {
    expect(chesscomMovementEase(-1)).toBe(0);
    expect(chesscomMovementEase(0)).toBe(0);
    expect(chesscomMovementEase(.5)).toBe(.5);
    expect(chesscomMovementEase(1)).toBe(1);
    expect(chesscomMovementEase(2)).toBe(1);
    expect(chesscomMovementEase(.25)).toBeLessThan(.25);
    expect(chesscomMovementEase(.75)).toBeGreaterThan(.75);
  });

  it('keeps tactical travel quick but gives longer moves time to read', () => {
    const oneTile = chesscomMovementDuration(1.55);
    const threeTiles = chesscomMovementDuration(4.65);
    expect(oneTile).toBeGreaterThanOrEqual(280);
    expect(threeTiles).toBeGreaterThan(oneTile);
    expect(threeTiles).toBeLessThanOrEqual(620);
  });

  it('adds visible footfalls without leaving the unit floating at either endpoint', () => {
    expect(chesscomMovementLift(0, 2)).toBe(0);
    expect(chesscomMovementLift(1, 2)).toBe(0);
    expect(chesscomMovementLift(.25, 2)).toBeGreaterThan(.05);
    expect(chesscomMovementLift(.75, 2)).toBeGreaterThan(.05);
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

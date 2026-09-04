import { describe, expect, it } from 'vitest';
import {
  chesscomMoveCostLabel,
  chesscomMovementDuration,
  chesscomMovementEase,
  chesscomMovementLift,
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
});

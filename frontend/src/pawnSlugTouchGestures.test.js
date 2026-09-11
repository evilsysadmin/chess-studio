import { describe, expect, it } from 'vitest';
import {
  PAWN_SLUG_TOUCH_GESTURE,
  pawnSlugTouchHapticPattern,
  pawnSlugTouchMinimumPressMs,
  pawnSlugTouchMoveDirection,
  pawnSlugTouchTapAction,
  pawnSlugTouchVerticalAction,
  pawnSlugTouchZone,
} from './pawnSlugTouchGestures.js';

describe('Pawn Slug landscape touch gestures', () => {
  it('splits the stage into movement, gesture and fire zones', () => {
    expect(pawnSlugTouchZone(100, 1000)).toBe('move');
    expect(pawnSlugTouchZone(500, 1000)).toBe('gesture');
    expect(pawnSlugTouchZone(850, 1000)).toBe('fire');
    expect(PAWN_SLUG_TOUCH_GESTURE.moveZoneEnd).toBeLessThan(PAWN_SLUG_TOUCH_GESTURE.gestureZoneEnd);
  });

  it('uses the left movement zone as an invisible two-direction pad', () => {
    expect(pawnSlugTouchMoveDirection(80, 1000)).toBe('left');
    expect(pawnSlugTouchMoveDirection(300, 1000)).toBe('right');
  });

  it('recognizes only deliberate vertical swipes for jump and crouch', () => {
    expect(pawnSlugTouchVerticalAction(3, -44)).toBe('jump');
    expect(pawnSlugTouchVerticalAction(4, 48)).toBe('crouch');
    expect(pawnSlugTouchVerticalAction(2, -10)).toBeNull();
    expect(pawnSlugTouchVerticalAction(50, -34)).toBeNull();
  });

  it('treats a short central tap as jump without swallowing short drags', () => {
    expect(pawnSlugTouchTapAction(2, 4)).toBe('jump');
    expect(pawnSlugTouchTapAction(15, 8)).toBe('jump');
    expect(pawnSlugTouchTapAction(19, 0)).toBeNull();
    expect(pawnSlugTouchTapAction(14, 14)).toBeNull();
  });

  it('keeps short jump, fire and power taps alive long enough for the engine to sample them', () => {
    expect(pawnSlugTouchMinimumPressMs('jump')).toBe(PAWN_SLUG_TOUCH_GESTURE.jumpMinPressMs);
    expect(pawnSlugTouchMinimumPressMs('fire')).toBe(PAWN_SLUG_TOUCH_GESTURE.fireMinPressMs);
    expect(pawnSlugTouchMinimumPressMs('grenade')).toBe(PAWN_SLUG_TOUCH_GESTURE.grenadeMinPressMs);
    expect(PAWN_SLUG_TOUCH_GESTURE.fireMinPressMs).toBeGreaterThanOrEqual(45);
    expect(PAWN_SLUG_TOUCH_GESTURE.grenadeMinPressMs).toBeGreaterThanOrEqual(50);
    expect(PAWN_SLUG_TOUCH_GESTURE.grenadeMinPressMs).toBeLessThan(PAWN_SLUG_TOUCH_GESTURE.jumpMinPressMs);
    expect(pawnSlugTouchMinimumPressMs('left')).toBe(0);
    expect(pawnSlugTouchMinimumPressMs('crouch')).toBe(0);
  });

  it('keeps haptic feedback brief and never models machine-gun vibration', () => {
    expect(pawnSlugTouchHapticPattern('fire')).toEqual([5]);
    expect(pawnSlugTouchHapticPattern('jump')).toEqual([12]);
    expect(pawnSlugTouchHapticPattern('grenade')).toEqual([18, 18, 18]);
    expect(pawnSlugTouchHapticPattern('unknown')).toEqual([]);
  });
});

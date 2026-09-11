export const PAWN_SLUG_TOUCH_GESTURE = Object.freeze({
  moveZoneEnd: 0.42,
  gestureZoneEnd: 0.68,
  verticalThresholdPx: 30,
  verticalAxisBias: 1.12,
  tapMaxTravelPx: 18,
  jumpMinPressMs: 72,
});

function clamp01(value) {
  return Math.max(0, Math.min(1, Number(value) || 0));
}

export function pawnSlugTouchZone(x, width) {
  const safeWidth = Math.max(1, Number(width) || 1);
  const ratio = clamp01((Number(x) || 0) / safeWidth);
  if (ratio < PAWN_SLUG_TOUCH_GESTURE.moveZoneEnd) return 'move';
  if (ratio < PAWN_SLUG_TOUCH_GESTURE.gestureZoneEnd) return 'gesture';
  return 'fire';
}

export function pawnSlugTouchMoveDirection(x, width) {
  const safeWidth = Math.max(1, Number(width) || 1);
  const split = safeWidth * PAWN_SLUG_TOUCH_GESTURE.moveZoneEnd * 0.5;
  return (Number(x) || 0) < split ? 'left' : 'right';
}

export function pawnSlugTouchVerticalAction(deltaX, deltaY) {
  const dx = Number(deltaX) || 0;
  const dy = Number(deltaY) || 0;
  const vertical = Math.abs(dy);
  const horizontal = Math.abs(dx);
  if (vertical < PAWN_SLUG_TOUCH_GESTURE.verticalThresholdPx) return null;
  if (vertical < horizontal * PAWN_SLUG_TOUCH_GESTURE.verticalAxisBias) return null;
  return dy < 0 ? 'jump' : 'crouch';
}

export function pawnSlugTouchTapAction(deltaX, deltaY) {
  const dx = Number(deltaX) || 0;
  const dy = Number(deltaY) || 0;
  return Math.hypot(dx, dy) <= PAWN_SLUG_TOUCH_GESTURE.tapMaxTravelPx ? 'jump' : null;
}

export function pawnSlugTouchHapticPattern(action) {
  if (action === 'jump') return Object.freeze([12]);
  if (action === 'crouch') return Object.freeze([8]);
  if (action === 'fire') return Object.freeze([5]);
  if (action === 'grenade') return Object.freeze([18, 18, 18]);
  if (action === 'left' || action === 'right') return Object.freeze([6]);
  return Object.freeze([]);
}

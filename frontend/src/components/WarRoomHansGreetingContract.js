export const HANS_GREETING_LINE = 'Buenas tardes, señor.';
export const MATTHIAS_HANS_REPLY_LINE = 'Buenas tardes, Hans.';
export const HANS_GREETING_HANS_MS = 1650;
export const HANS_GREETING_TOTAL_MS = 3550;

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

/**
 * Converts the renderer's Hans NDC probe into a speech-tail anchor.
 *
 * Hans' renderer probe follows his actual world position every painted frame.
 * The small vertical lift places the tail around his upper body/head without
 * coupling the DOM overlay to the Three.js model internals. Horizontal tail
 * bias keeps the bubble inside the viewport when he enters near a side wall.
 */
export function projectHansGreetingAnchor({ ndcX, ndcY, coarsePointer = false } = {}) {
  const x = Number(ndcX);
  const y = Number(ndcY);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;

  const left = clamp((x + 1) * 50, 3, 97);
  const headLift = coarsePointer ? 7.8 : 6.8;
  const top = clamp(((1 - y) * 50) - headLift, 7, 92);

  if (x > 0.48) {
    return { left, top, bubbleShiftPercent: -82, tailPercent: 82 };
  }
  if (x < -0.48) {
    return { left, top, bubbleShiftPercent: -18, tailPercent: 18 };
  }
  return { left, top, bubbleShiftPercent: -50, tailPercent: 50 };
}

export function hansGreetingPhase(elapsedMs) {
  const elapsed = Math.max(0, Number(elapsedMs) || 0);
  if (elapsed < HANS_GREETING_HANS_MS) return 'hans';
  if (elapsed < HANS_GREETING_TOTAL_MS) return 'matthias';
  return '';
}

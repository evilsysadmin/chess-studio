export const MATTHIAS_FIRE_CALL_LINE = 'HANS! El fuego, bitte.';
export const HANS_FIRE_REPLY_LINE = 'Sí, señor.';
export const MATTHIAS_FIRE_CALL_MS = 1450;
export const HANS_FIRE_REPLY_MS = 1350;

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

export function projectHansFireReplyAnchor({ ndcX, ndcY, coarsePointer = false } = {}) {
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

export function fireCallPhase(elapsedMs, hansOnscreen = false) {
  const elapsed = Math.max(0, Number(elapsedMs) || 0);
  if (elapsed < MATTHIAS_FIRE_CALL_MS) return 'matthias';
  if (!hansOnscreen) return 'await-hans';
  if (elapsed < MATTHIAS_FIRE_CALL_MS + HANS_FIRE_REPLY_MS) return 'hans';
  return '';
}

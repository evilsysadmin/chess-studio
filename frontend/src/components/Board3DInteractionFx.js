function clamp01(value) {
  return Math.max(0, Math.min(1, Number(value) || 0));
}

const PULSE_PROFILES = Object.freeze({
  selected: Object.freeze({ periodMs: 2400, opacityDepth: 0.08, scaleLift: 0.018 }),
  check: Object.freeze({ periodMs: 1750, opacityDepth: 0.11, scaleLift: 0.026 }),
});

export function board3DHighlightPulse({ kind, nowMs = 0, reducedMotion = false, coarsePointer = false } = {}) {
  const profile = PULSE_PROFILES[kind];
  if (!profile || reducedMotion) return { opacityFactor: 1, scaleFactor: 1 };
  const phase = ((Math.max(0, Number(nowMs) || 0) % profile.periodMs) / profile.periodMs) * Math.PI * 2;
  const wave = (Math.sin(phase - Math.PI / 2) + 1) / 2;
  const compactFactor = coarsePointer ? 0.56 : 1;
  return {
    opacityFactor: 1 - profile.opacityDepth * compactFactor * (1 - wave),
    scaleFactor: 1 + profile.scaleLift * compactFactor * wave,
  };
}

export function board3DPieceInteractionPose({ selected = false, hovered = false, coarsePointer = false } = {}) {
  if (selected) {
    return coarsePointer
      ? { yOffset: 0.016, scaleFactor: 1.012 }
      : { yOffset: 0.026, scaleFactor: 1.018 };
  }
  if (hovered && !coarsePointer) return { yOffset: 0.014, scaleFactor: 1.009 };
  return { yOffset: 0, scaleFactor: 1 };
}

export function board3DCaptureWarmBoost({ progress = 0, coarsePointer = false } = {}) {
  const p = clamp01(progress);
  if (p <= 0.34 || p >= 1) return 0;
  const local = clamp01((p - 0.34) / 0.66);
  const impact = Math.sin(local * Math.PI);
  return impact * (coarsePointer ? 0.72 : 1.55);
}

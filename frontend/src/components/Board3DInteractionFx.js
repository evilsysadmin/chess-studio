function clamp01(value) {
  return Math.max(0, Math.min(1, Number(value) || 0));
}

const PULSE_PROFILES = Object.freeze({
  selected: Object.freeze({ periodMs: 2400, opacityDepth: 0.08, scaleLift: 0.018 }),
  check: Object.freeze({ periodMs: 1750, opacityDepth: 0.11, scaleLift: 0.026 }),
});

export function writeBoard3DHighlightPulse(
  target,
  kind,
  nowMs = 0,
  reducedMotion = false,
  coarsePointer = false,
) {
  const output = target || { opacityFactor: 1, scaleFactor: 1 };
  const profile = PULSE_PROFILES[kind];
  if (!profile || reducedMotion) {
    output.opacityFactor = 1;
    output.scaleFactor = 1;
    return output;
  }
  const phase = ((Math.max(0, Number(nowMs) || 0) % profile.periodMs) / profile.periodMs) * Math.PI * 2;
  const wave = (Math.sin(phase - Math.PI / 2) + 1) / 2;
  const compactFactor = coarsePointer ? 0.56 : 1;
  output.opacityFactor = 1 - profile.opacityDepth * compactFactor * (1 - wave);
  output.scaleFactor = 1 + profile.scaleLift * compactFactor * wave;
  return output;
}

export function board3DHighlightPulse({ kind, nowMs = 0, reducedMotion = false, coarsePointer = false } = {}) {
  return writeBoard3DHighlightPulse(
    { opacityFactor: 1, scaleFactor: 1 },
    kind,
    nowMs,
    reducedMotion,
    coarsePointer,
  );
}

export function board3DPieceInteractionPose({ selected = false, hovered = false, coarsePointer = false } = {}) {
  if (selected) {
    return coarsePointer
      ? { yOffset: 0.026, scaleFactor: 1.019 }
      : { yOffset: 0.032, scaleFactor: 1.022 };
  }
  if (hovered && !coarsePointer) return { yOffset: 0.014, scaleFactor: 1.009 };
  return { yOffset: 0, scaleFactor: 1 };
}

// Derived from a single animation progress value, never multiplied onto the
// previous frame's scale: capture weight must look the same at every FPS.
export function board3DCapturedGhostScale(impact = 0, coarsePointer = false) {
  return 1 - clamp01(impact) * (coarsePointer ? 0.11 : 0.15);
}

// Presentation-only transformation: use the resting scale each frame, not
// last frame's mutated scale. Keeps tilt, compression and fade in one module.
export function applyBoard3DCaptureGhostPose(ghost, restScale, materials, impact, tilt, coarsePointer = false) {
  const progress = clamp01(impact);
  ghost.rotation.z = tilt * progress;
  ghost.rotation.x = progress * 0.16;
  ghost.position.y = 0.1 - progress * 0.075;
  ghost.scale.copy(restScale).multiplyScalar(board3DCapturedGhostScale(progress, coarsePointer));
  const opacity = 1 - progress * 0.92;
  for (const material of materials) material.opacity = opacity;
}

export function board3DCaptureWarmBoostValue(progress = 0, coarsePointer = false) {
  const p = clamp01(progress);
  if (p <= 0.34 || p >= 1) return 0;
  const local = clamp01((p - 0.34) / 0.66);
  const impact = Math.sin(local * Math.PI);
  return impact * (coarsePointer ? 0.72 : 1.55);
}

export function board3DCaptureWarmBoost({ progress = 0, coarsePointer = false } = {}) {
  return board3DCaptureWarmBoostValue(progress, coarsePointer);
}

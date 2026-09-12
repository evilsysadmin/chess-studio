const TORCH_PHASES = Object.freeze([0.37, 2.11]);
const CHANDELIER_PHASES = Object.freeze([0.83, 2.67]);

export function homeCastleTorchFlicker(index, elapsedMs, reducedMotion = false) {
  if (reducedMotion) return 1;
  const phase = TORCH_PHASES[index % TORCH_PHASES.length] ?? TORCH_PHASES[0];
  const time = Math.max(0, Number(elapsedMs) || 0) / 1000;
  const slow = Math.sin((time * 4.1) + phase) * 0.035;
  const fast = Math.sin((time * 9.7) + (phase * 1.73)) * 0.018;
  const shimmer = Math.sin((time * 15.3) + (phase * 0.61)) * 0.008;
  return 1 + slow + fast + shimmer;
}

export function homeCastleChandelierShimmer(index, elapsedMs, reducedMotion = false) {
  if (reducedMotion) return 1;
  const phase = CHANDELIER_PHASES[index % CHANDELIER_PHASES.length] ?? CHANDELIER_PHASES[0];
  const time = Math.max(0, Number(elapsedMs) || 0) / 1000;
  const slow = Math.sin((time * 0.72) + phase) * 0.018;
  const drift = Math.sin((time * 1.31) + (phase * 1.41)) * 0.007;
  return 1 + slow + drift;
}

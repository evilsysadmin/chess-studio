const TORCH_PHASES = Object.freeze([0.37, 2.11]);

export function homeCastleTorchFlicker(index, elapsedMs, reducedMotion = false) {
  if (reducedMotion) return 1;
  const phase = TORCH_PHASES[index % TORCH_PHASES.length] ?? TORCH_PHASES[0];
  const time = Math.max(0, Number(elapsedMs) || 0) / 1000;
  const slow = Math.sin((time * 4.1) + phase) * 0.035;
  const fast = Math.sin((time * 9.7) + (phase * 1.73)) * 0.018;
  const shimmer = Math.sin((time * 15.3) + (phase * 0.61)) * 0.008;
  return 1 + slow + fast + shimmer;
}

export function homeCastleTorchFlameScale(flicker) {
  const normalized = Math.max(0.9, Math.min(1.1, Number(flicker) || 1));
  return {
    xz: 0.82 * (0.985 + ((normalized - 1) * 0.18)),
    y: 1 + ((normalized - 1) * 0.62),
  };
}

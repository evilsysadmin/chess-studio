// Pure conservative interpretation of a completed *physical* Home A/B/B/A.
// A reported candidate is NEVER an approval; another device run and PNG review
// remain mandatory. Do not manufacture confidence from a small positive delta.
export function classifyHomeFlamePassContrast({
  savedMainDrawCalls, gpuDifferenceMs, pairedDifferencesMs,
  baseDriftMs, variantDriftMs, flags,
}) {
  if (!Number.isSafeInteger(savedMainDrawCalls)
      || !Number.isFinite(gpuDifferenceMs)
      || !Array.isArray(pairedDifferencesMs) || pairedDifferencesMs.length !== 2
      || !pairedDifferencesMs.every(Number.isFinite)
      || !Number.isFinite(baseDriftMs) || baseDriftMs < 0
      || !Number.isFinite(variantDriftMs) || variantDriftMs < 0
      || !Array.isArray(flags) || !flags.every((value) => typeof value === 'string')) {
    throw new Error('Home flame A/B requires finite physical draw/timing evidence');
  }
  // Two same-mode revisits give an observed spread, not a confidence interval.
  // Requiring the improvement to exceed the larger spread is a conservative
  // triage heuristic; it is explicitly NOT a statistical significance claim.
  const observedSpreadMs = Math.max(baseDriftMs, variantDriftMs);
  let verdict;
  if (savedMainDrawCalls <= 0) verdict = 'no-observed-draw-reduction';
  else if (flags.length) verdict = 'inconclusive-unstable-paired-timings';
  else if (gpuDifferenceMs <= 0 || pairedDifferencesMs.some((delta) => delta <= 0)) {
    verdict = 'no-consistent-gpu-time-improvement';
  } else if (gpuDifferenceMs <= observedSpreadMs) {
    verdict = 'inconclusive-effect-within-observed-spread';
  } else {
    verdict = 'candidate-repeat-and-review-pngs';
  }
  return {
    verdict,
    observedSpreadMs,
    repeatHardwareRunRequired: true,
    visualReviewRequired: true,
    productionApproved: false,
  };
}

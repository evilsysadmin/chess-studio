// Pure aggregation for the local-only physical-GPU A/B/B/A benchmark.
// Never allow null/NaN measurements to be coerced into fake savings.
const LIGHT_OFF_MODES = new Set([
  'aux-off', 'aux-wall-off', 'aux-board-off', 'aux-stairs-off', 'aux-accent-off',
  'wall-pair',
  'pair-aux-board-off', 'pair-aux-stairs-off', 'pair-aux-accent-off',
  'pair-aux-accent-dungeon-off', 'pair-aux-accent-table-off',
  'pair-aux-accent-reading-off',
]);

function median(numbers) {
  const sorted = [...numbers].sort((a, b) => a - b);
  const midpoint = sorted.length / 2;
  return sorted.length % 2
    ? sorted[Math.floor(midpoint)]
    : (sorted[midpoint - 1] + sorted[midpoint]) / 2;
}

export function summarizeHomeGpuLightContrast(visits, offMode, baselineMode = 'normal') {
  const expectedBaseline = offMode.startsWith('pair-aux-') ? 'pair-normal' : 'normal';
  if (!LIGHT_OFF_MODES.has(offMode)) {
    throw new Error('Home GPU A/B/B/A requires a known light-off mode');
  }
  if (!Array.isArray(visits) || visits.length !== 4) {
    throw new Error('Home GPU A/B/B/A requires four visits');
  }
  if (baselineMode !== expectedBaseline) {
    throw new Error('Home GPU A/B/B/A requires a compatible baseline/off mode');
  }
  const sequence = [baselineMode, offMode, offMode, baselineMode];
  for (let index = 0; index < sequence.length; index += 1) {
    const visit = visits[index];
    if (!visit || visit.lightProbe !== sequence[index]) {
      throw new Error(`Home GPU A/B/B/A visit ${index + 1} has an unexpected light mode`);
    }
    if (!Number.isFinite(visit.gpuMedianMs) || visit.gpuMedianMs <= 0
      || !Number.isFinite(visit.cpuP95MedianMs) || visit.cpuP95MedianMs < 0) {
      throw new Error(`Home GPU A/B/B/A visit ${index + 1} has incomplete timing samples`);
    }
  }
  const normal = [visits[0], visits[3]];
  const auxOff = [visits[1], visits[2]];
  const baseGpuMs = median(normal.map((visit) => visit.gpuMedianMs));
  const auxOffGpuMs = median(auxOff.map((visit) => visit.gpuMedianMs));
  const gpuDifferenceMs = baseGpuMs - auxOffGpuMs;
  // A/B/B/A cancels some monotonic drift, but does not make thermal, OS
  // scheduling, driver or GC variation disappear. Report within-mode drift
  // and contradictory paired signs instead of claiming a stable speedup.
  const percentSpread = (left, right, centre) => (
    100 * Math.abs(left - right) / centre
  );
  const normalDriftPct = percentSpread(normal[0].gpuMedianMs,
    normal[1].gpuMedianMs, baseGpuMs);
  const auxOffDriftPct = percentSpread(auxOff[0].gpuMedianMs,
    auxOff[1].gpuMedianMs, auxOffGpuMs);
  const pairedDifferencesMs = [
    normal[0].gpuMedianMs - auxOff[0].gpuMedianMs,
    normal[1].gpuMedianMs - auxOff[1].gpuMedianMs,
  ];
  const pairedSignsAgree = pairedDifferencesMs.every((ms) => ms > 0)
    || pairedDifferencesMs.every((ms) => ms < 0);
  const flags = [];
  if (normalDriftPct > 15) flags.push('normal-baseline-drift-over-15pct');
  if (auxOffDriftPct > 15) flags.push('auxiliary-variant-drift-over-15pct');
  if (!pairedSignsAgree) flags.push('paired-contrast-direction-disagrees');
  return {
    gpuMedianMs: { normal: baseGpuMs, auxOff: auxOffGpuMs },
    gpuDifferenceMs,
    gpuContrastPct: 100 * gpuDifferenceMs / baseGpuMs,
    stability: {
      normalDriftPct,
      auxOffDriftPct,
      pairedDifferencesMs,
      pairedSignsAgree,
      flags,
      // Informational only: even zero flags do not prove reproducibility.
      repeatRecommended: true,
    },
    cpuP95MedianMs: {
      normal: median(normal.map((visit) => visit.cpuP95MedianMs)),
      auxOff: median(auxOff.map((visit) => visit.cpuP95MedianMs)),
    },
  };
}

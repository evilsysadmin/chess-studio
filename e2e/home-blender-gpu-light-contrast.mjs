// Pure aggregation for the local-only physical-GPU A/B/B/A benchmark.
// Never allow null/NaN measurements to be coerced into fake savings.
const LIGHT_OFF_MODES = new Set([
  'aux-off', 'aux-wall-off', 'aux-board-off', 'aux-stairs-off', 'aux-accent-off',
]);

function median(numbers) {
  const sorted = [...numbers].sort((a, b) => a - b);
  const midpoint = sorted.length / 2;
  return sorted.length % 2
    ? sorted[Math.floor(midpoint)]
    : (sorted[midpoint - 1] + sorted[midpoint]) / 2;
}

export function summarizeHomeGpuLightContrast(visits, offMode) {
  if (!LIGHT_OFF_MODES.has(offMode) || !Array.isArray(visits) || visits.length !== 4) {
    throw new Error('Home GPU A/B/B/A requires four visits and a known light-off mode');
  }
  const sequence = ['normal', offMode, offMode, 'normal'];
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
  return {
    gpuMedianMs: { normal: baseGpuMs, auxOff: auxOffGpuMs },
    gpuDifferenceMs,
    gpuContrastPct: 100 * gpuDifferenceMs / baseGpuMs,
    cpuP95MedianMs: {
      normal: median(normal.map((visit) => visit.cpuP95MedianMs)),
      auxOff: median(auxOff.map((visit) => visit.cpuP95MedianMs)),
    },
  };
}

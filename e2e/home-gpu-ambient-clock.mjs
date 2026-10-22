// Freeze test-context Home lighting only for explicitly controlled GPU probes.
// Ordinary gameplay and ad-hoc non-census profiling keep the real clock.
const HOURS = Object.freeze({ dawn: 7, day: 13, dusk: 19, night: 23 });

export function homeGpuBenchmarkAmbientHour({
  lightProbe = false,
  drawCensus = false,
  ambient = 'night',
} = {}) {
  if (!lightProbe && !drawCensus) return null;
  const mode = String(ambient).trim().toLowerCase();
  if (!Object.hasOwn(HOURS, mode)) {
    throw new Error('Unknown CHESS_HOME_GPU_AMBIENT: choose dawn, day, dusk, or night');
  }
  return HOURS[mode];
}

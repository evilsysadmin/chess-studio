// Presentation-only minimum: backend computation runs in parallel with this
// abortable delay. The clock is already ticking for the CPU while busy.
export function cpuPresentationDelayMs({ cpuTime = null, gameOver = false, random = Math.random() } = {}) {
  if (gameOver) return 0;
  if (cpuTime !== null && Number.isFinite(cpuTime) && cpuTime <= 8) return 350;
  const sample = Number.isFinite(random) ? Math.min(1, Math.max(0, random)) : 0.5;
  return 2000 + Math.floor(sample * 1000);
}

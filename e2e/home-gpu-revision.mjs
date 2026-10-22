// Reject unattributed physical Home GPU measurements before visiting Chromium.
// A valid revision is the exact full commit SHA, never a short ref or null.
export function homeGpuBenchmarkRevision(raw, { hardware = false } = {}) {
  const revision = typeof raw === 'string' ? raw.trim() : '';
  if (!revision) {
    if (hardware) {
      throw new Error(
        'Physical Home GPU benchmarks require CHESS_HOME_GPU_REVISION=full-40-char-SHA; run the Makefile target or set the exact git rev-parse HEAD',
      );
    }
    return null; // Software-only diagnostics may remain unattributed.
  }
  if (!/^[0-9a-f]{40}$/i.test(revision)) {
    throw new Error('CHESS_HOME_GPU_REVISION must be an exact 40-character hexadecimal commit SHA');
  }
  return revision.toLowerCase();
}

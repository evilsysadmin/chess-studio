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

/**
 * Physical GPU screenshots must be attributable to the exact executed source.
 * HEAD alone is insufficient: local tracked edits or staged modifications
 * can alter the renderer without altering the advertised commit SHA.
 * The caller supplies `git status --porcelain=v1 --untracked-files=no`;
 * generated/untracked PNG evidence is deliberately not part of the tree gate.
 */
export function homeGpuPhysicalCheckoutProvenance(rawRevision, checkoutRevision, trackedStatus) {
  const expected = homeGpuBenchmarkRevision(rawRevision, { hardware: true });
  const actual = homeGpuBenchmarkRevision(checkoutRevision, { hardware: true });
  if (expected !== actual) {
    throw new Error('Physical Home GPU SHA does not match checkout HEAD');
  }
  if (typeof trackedStatus !== 'string' || trackedStatus.trim().length > 0) {
    throw new Error('Physical Home GPU requires a clean tracked Git worktree and index');
  }
  return expected;
}

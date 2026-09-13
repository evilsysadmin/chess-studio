export const MIN_CLEAR_BEST_DEPTH = 2;
export const CLEAR_BEST_GAP_CP = 100;

function finiteOrNull(value) {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

export function bestMoveConstraintFor({ candidateCount, analysisDepth, secondBest, bestToSecondGap } = {}) {
  const count = finiteOrNull(candidateCount);
  const depth = finiteOrNull(analysisDepth);
  const gap = finiteOrNull(bestToSecondGap);

  if (count === 1) {
    return { kind: 'only-legal', candidateCount: 1, gapCp: null };
  }
  if (
    count === null
    || count < 2
    || depth === null
    || depth < MIN_CLEAR_BEST_DEPTH
    || !secondBest
    || gap === null
    || gap < CLEAR_BEST_GAP_CP
  ) return null;

  return {
    kind: 'clear-best',
    candidateCount: count,
    gapCp: Math.round(gap),
  };
}
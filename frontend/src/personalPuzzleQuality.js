import { bestMoveConstraintFor } from './factualBestMoveConstraint.js';

// Contrato único de calidad para puzzles personales generados por Workers AI.
// Incrementar esta versión significa que los puzzles persistidos por una versión
// anterior deben demostrar explícitamente que pasaron TODOS los gates actuales
// antes de volver a la cola activa.
export const PERSONAL_PUZZLE_QUALITY_VERSION = 7;
export const PERSONAL_PUZZLE_MIN_ENGINE_LEVEL = 92;
export const PERSONAL_PUZZLE_MIN_ANALYSIS_DEPTH = 2;

export function provesCurrentPersonalPuzzleQuality(puzzle) {
  if (puzzle?.source !== 'workers-ai-validated') return true;

  const candidateCount = Number(puzzle?.engineCandidateCount);
  const analysisDepth = Number(puzzle?.engineAnalysisDepth);
  const rawGap = puzzle?.engineBestToSecondGap;
  const gap = rawGap == null ? null : Number(rawGap);
  const bestMoveConstraint = bestMoveConstraintFor({
    candidateCount,
    analysisDepth,
    secondBest: puzzle?.engineSecondBest || null,
    bestToSecondGap: gap,
  });

  return Number(puzzle?.aiQualityVersion) === PERSONAL_PUZZLE_QUALITY_VERSION
    && puzzle?.tacticalBestMoveChecked === true
    && puzzle?.tacticalRefutationChecked === true
    && Number(puzzle?.aiValidatedLevel) >= PERSONAL_PUZZLE_MIN_ENGINE_LEVEL
    && Number.isInteger(analysisDepth)
    && analysisDepth >= PERSONAL_PUZZLE_MIN_ANALYSIS_DEPTH
    && Number.isInteger(candidateCount)
    && candidateCount >= 1
    && bestMoveConstraint !== null;
}
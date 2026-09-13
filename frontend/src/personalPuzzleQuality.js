import { bestMoveConstraintFor } from './factualBestMoveConstraint.js';

// Contrato único de calidad para puzzles personales generados por Workers AI.
// Incrementar esta versión significa que los puzzles persistidos por una versión
// anterior deben demostrar explícitamente que pasaron TODOS los gates actuales
// antes de volver a la cola activa.
export const PERSONAL_PUZZLE_QUALITY_VERSION = 9;
export const PERSONAL_PUZZLE_MIN_ENGINE_LEVEL = 92;
export const PERSONAL_PUZZLE_MIN_ANALYSIS_DEPTH = 2;

function hasEngineMoveShape(move) {
  return /^[a-h][1-8]$/.test(String(move?.from || ''))
    && /^[a-h][1-8]$/.test(String(move?.to || ''));
}

function sameEngineMove(left, right) {
  return hasEngineMoveShape(left)
    && hasEngineMoveShape(right)
    && left.from === right.from
    && left.to === right.to
    && (left.promotion || null) === (right.promotion || null);
}

function hasProvenPrincipalVariation(puzzle) {
  if (puzzle?.enginePrincipalVariationChecked !== true) return false;
  const line = puzzle?.enginePrincipalVariation;
  if (!Array.isArray(line) || !line.length || !line.every(hasEngineMoveShape)) return false;

  if (puzzle?.engineTerminalAfterSolution === true) {
    return line.length === 1 && puzzle?.engineBestDefense == null;
  }

  return line.length >= 2
    && hasEngineMoveShape(puzzle?.engineBestDefense)
    && sameEngineMove(line[1], puzzle.engineBestDefense);
}

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
  const bestDefenseProven = puzzle?.tacticalBestDefenseChecked === true
    && hasProvenPrincipalVariation(puzzle);

  return Number(puzzle?.aiQualityVersion) === PERSONAL_PUZZLE_QUALITY_VERSION
    && puzzle?.tacticalBestMoveChecked === true
    && puzzle?.tacticalRefutationChecked === true
    && bestDefenseProven
    && Number(puzzle?.aiValidatedLevel) >= PERSONAL_PUZZLE_MIN_ENGINE_LEVEL
    && Number.isInteger(analysisDepth)
    && analysisDepth >= PERSONAL_PUZZLE_MIN_ANALYSIS_DEPTH
    && Number.isInteger(candidateCount)
    && candidateCount >= 1
    && bestMoveConstraint !== null;
}
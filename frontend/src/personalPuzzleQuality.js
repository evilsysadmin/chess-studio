// Contrato único de calidad para puzzles personales generados por Workers AI.
// Incrementar esta versión significa que los puzzles persistidos por una versión
// anterior deben demostrar explícitamente que pasaron TODOS los gates actuales
// antes de volver a la cola activa.
export const PERSONAL_PUZZLE_QUALITY_VERSION = 4;

export function provesCurrentPersonalPuzzleQuality(puzzle) {
  if (puzzle?.source !== 'workers-ai-validated') return true;
  return Number(puzzle?.aiQualityVersion) === PERSONAL_PUZZLE_QUALITY_VERSION
    && puzzle?.tacticalBestMoveChecked === true
    && puzzle?.tacticalRefutationChecked === true;
}

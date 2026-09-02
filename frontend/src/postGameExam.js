import { personalPuzzleFromMistake } from './personalPuzzles.js';

export const POST_GAME_EXAM_MIN_LOSS = 80;
export const POST_GAME_EXAM_LIMIT = 3;

export function buildPostGameExamPositions(history, humanColor, report, meta = {}, { limit = POST_GAME_EXAM_LIMIT } = {}) {
  const safeLimit = Math.max(1, Math.min(POST_GAME_EXAM_LIMIT, Math.floor(Number(limit) || POST_GAME_EXAM_LIMIT)));
  const seen = new Set();
  const positions = [];

  for (const mistake of report?.topMistakes || []) {
    if (Number(mistake?.loss || 0) < POST_GAME_EXAM_MIN_LOSS) continue;
    const puzzle = personalPuzzleFromMistake(history, humanColor, mistake, meta);
    if (!puzzle || seen.has(puzzle.id)) continue;
    seen.add(puzzle.id);
    positions.push({
      id: `exam-${puzzle.id}`,
      fen: puzzle.fen,
      solution: puzzle.solution,
      humanColor: puzzle.humanColor || humanColor,
      played: puzzle.played,
      suggested: puzzle.suggested,
      loss: puzzle.loss,
      moveNumber: puzzle.moveNumber,
      sourceGameId: puzzle.sourceGameId || meta.gameId || null,
    });
    if (positions.length >= safeLimit) break;
  }

  return positions;
}

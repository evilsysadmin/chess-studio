import { identifyOpening } from './openings.js';

export function buildPostGameReportMeta({ game, finalOutcome, memoryContext = {}, timeControlId = 'none', hintMode = 'off', pressureMoves = 0, pressureIncidents = 0 } = {}) {
  return {
    gameId: game?.id || null,
    initialFen: game?.initialFen || null,
    date: new Date().toISOString(),
    outcome: finalOutcome || null,
    difficulty: game?.difficulty ?? null,
    opening: memoryContext.nemesisOpening || identifyOpening((game?.history || []).map((move) => move.san).filter(Boolean)),
    timeControlId: timeControlId || 'none',
    pressureMoves: Number(pressureMoves || 0),
    pressureIncidents: Number(pressureIncidents || 0),
    mode: memoryContext.suddenDeath ? 'sudden' : memoryContext.nemesis ? 'nemesis-training' : memoryContext.ghost ? 'ghost' : hintMode === 'paid' ? 'tournament' : hintMode === 'free' ? 'practice' : 'casual',
  };
}

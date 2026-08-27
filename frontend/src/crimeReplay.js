export function buildGameCrimeReplayRecord(finishedGame, mode, outcome) {
  if (!finishedGame?.id || !Array.isArray(finishedGame.history)) return null;
  return {
    id: `crime-${finishedGame.id}`,
    date: new Date().toISOString(),
    difficulty: finishedGame.difficulty,
    humanColor: finishedGame.humanColor,
    outcome,
    endReason: null,
    moves: finishedGame.history,
    finalFen: finishedGame.fen,
    initialFen: finishedGame.initialFen || null,
    mode,
  };
}

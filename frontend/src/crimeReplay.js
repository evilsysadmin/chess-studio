import { Chess } from 'chess.js';

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

export function crimeRetryLaunch(fen, record, { crimeMode = false, pinnedReport = null, step = null } = {}) {
  if (!crimeMode || !pinnedReport || !record || !['w', 'b'].includes(record.humanColor)) return null;
  const crimeStep = Math.max(0, Number(pinnedReport.index) || 0);
  if (Number(step) !== crimeStep) return null;
  try {
    const chess = new Chess(fen);
    if (chess.isGameOver() || chess.turn() !== record.humanColor) return null;
    return {
      fen: chess.fen(),
      humanColor: record.humanColor,
      difficulty: Math.max(0, Math.min(100, Math.round(Number(record.difficulty) || 50))),
      meta: { sourceRecord: record, rescue: true, crimeRetry: true },
    };
  } catch {
    return null;
  }
}

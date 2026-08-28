import { strictInvariant } from './stateTransition.js';

export const SERIES_FLOW = Object.freeze({ READY: 'ready', PLAYING: 'playing', FINISHED: 'finished' });

export function seriesFlowPhase(series) {
  if (!series) return null;
  if (series.winner) return SERIES_FLOW.FINISHED;
  if (series.currentGameId) return SERIES_FLOW.PLAYING;
  return SERIES_FLOW.READY;
}

export function assertSeriesFlowInvariant(series) {
  strictInvariant(Boolean(series && typeof series === 'object'), 'series missing');
  const phase = seriesFlowPhase(series);
  if (phase === SERIES_FLOW.FINISHED) strictInvariant(!series.currentGameId, 'finished series cannot own an active game');
  if (phase === SERIES_FLOW.PLAYING) strictInvariant(typeof series.currentGameId === 'string' && series.currentGameId.length > 0, 'playing series needs game id');
  return true;
}

export function attachSeriesGame(series, gameId) {
  if (!series || series.winner || series.currentGameId || !gameId) return series;
  const next = { ...series, currentGameId: String(gameId) };
  assertSeriesFlowInvariant(next);
  return next;
}

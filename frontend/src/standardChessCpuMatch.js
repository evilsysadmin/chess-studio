import { abortableDelay, isAbortError } from './asyncControl.js';
import { applySuggestedOrLegalFallback } from './chessRules.js';

const PAUSE_POLL_MS = 150;

export async function runStandardCpuMatch({
  chess,
  whiteLevel,
  blackLevel,
  paceMs,
  analyzePosition,
  signal,
  isPaused = () => false,
  isStale = () => false,
  onThinking = () => {},
  onMove = () => {},
  onComplete = () => {},
  onError = () => {},
}) {
  const stale = () => Boolean(signal?.aborted || isStale());

  try {
    while (!stale()) {
      if (chess.isGameOver()) {
        onComplete(chess);
        return { reason: 'complete' };
      }

      while (isPaused() && !stale()) {
        await abortableDelay(PAUSE_POLL_MS, signal);
      }
      if (stale()) return { reason: 'cancelled' };

      const turn = chess.turn();
      const level = turn === 'w' ? whiteLevel : blackLevel;
      const requestedFen = chess.fen();
      onThinking(true);

      let suggestion = null;
      try {
        suggestion = await analyzePosition(requestedFen, level, { signal });
      } catch (error) {
        if (isAbortError(error) || stale()) return { reason: 'cancelled' };
        // Remote analysis improves move choice but cannot stall a spectator match.
        suggestion = null;
      }

      if (stale() || chess.fen() !== requestedFen) return { reason: 'stale' };
      onThinking(false);

      const { move } = applySuggestedOrLegalFallback(chess, suggestion);
      if (!move) {
        if (chess.isGameOver()) {
          onComplete(chess);
          return { reason: 'complete' };
        }
        const error = new Error('No se encontró ninguna jugada legal para continuar.');
        onError(error);
        return { reason: 'error', error };
      }

      onMove({ chess, move, turn });

      if (chess.isGameOver()) {
        onComplete(chess);
        return { reason: 'complete' };
      }

      await abortableDelay(Math.max(0, Number(paceMs) || 0), signal);
    }
    return { reason: 'cancelled' };
  } catch (error) {
    if (isAbortError(error) || stale()) return { reason: 'cancelled' };
    onError(error);
    return { reason: 'error', error };
  } finally {
    onThinking(false);
  }
}

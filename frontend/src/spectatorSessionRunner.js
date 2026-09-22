import { abortableDelay, isAbortError } from './asyncControl.js';
import { applySuggestedOrLegalFallback } from './chessRules.js';

export async function runSpectatorSession({
  chess, whiteLevel, blackLevel, paceMs, signal,
  shouldStop = () => false,
  isPaused = () => false,
  isCurrentPosition = () => true,
  analyzePosition,
  onThinking = () => {},
  onMove = () => {},
  onGameOver = () => {},
  onError = () => {},
}) {
  const stale = () => shouldStop() || signal?.aborted;
  try {
    while (!stale()) {
      if (chess.isGameOver()) { onGameOver(chess); return 'game-over'; }
      while (isPaused() && !stale()) await abortableDelay(150, signal);
      if (stale()) return 'stopped';

      const turn = chess.turn();
      const level = turn === 'w' ? whiteLevel : blackLevel;
      const requestedFen = chess.fen();
      onThinking(true);
      let suggestion = null;
      try {
        suggestion = await analyzePosition(requestedFen, level, signal);
      } catch (error) {
        if (isAbortError(error) || stale()) return 'stopped';
      }
      if (stale() || !isCurrentPosition(chess, requestedFen)) return 'stopped';
      onThinking(false);

      const { move: applied } = applySuggestedOrLegalFallback(chess, suggestion);
      if (!applied) {
        if (chess.isGameOver()) { onGameOver(chess); return 'game-over'; }
        throw new Error('No se encontró ninguna jugada legal para continuar.');
      }
      onMove({ chess, applied, turn });
      if (chess.isGameOver()) { onGameOver(chess); return 'game-over'; }
      await abortableDelay(Math.max(0, Number(paceMs) || 0), signal);
    }
    return 'stopped';
  } catch (error) {
    if (!isAbortError(error) && !stale()) onError(error);
    return 'stopped';
  } finally {
    onThinking(false);
  }
}

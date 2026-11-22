import { useEffect, useState } from 'react';
import { api } from './api.js';
import { analyzeGame } from './gameReport.js';
import { focusPersonalPuzzle, isPersonalPuzzleMastered, loadPersonalPuzzles, personalPuzzleFromMistake, savePersonalPuzzlesFromReport } from './personalPuzzles.js';

export async function preparePostGameTrainingOpportunity({ game, humanColor, meta = {}, signal } = {}) {
  if (!game?.id || !Array.isArray(game.history) || game.history.length === 0 || !humanColor) return null;
  const report = await analyzeGame(game.history, humanColor, api, {
    signal,
    initialFen: meta.initialFen || game.initialFen || null,
  });
  const candidates = (report?.topMistakes || [])
    .filter((move) => Number(move?.loss || 0) >= 80)
    .map((move) => personalPuzzleFromMistake(game.history, humanColor, move, meta))
    .filter(Boolean);
  if (!candidates.length) return null;

  savePersonalPuzzlesFromReport(game.history, humanColor, report, meta);
  // The worst reconstructed error may already be mastered or retired by the
  // canonical bank's quality gates. Offer the first *playable pending* error
  // from this report, never an unrelated fallback or a completed exercise.
  const pendingIds = new Set(loadPersonalPuzzles()
    .filter((puzzle) => !isPersonalPuzzleMastered(puzzle))
    .map((puzzle) => puzzle.id));
  const candidate = candidates.find((puzzle) => pendingIds.has(puzzle.id));
  if (!candidate) return null;
  return {
    puzzleId: candidate.id,
    moveNumber: candidate.moveNumber,
    played: candidate.played,
    suggested: candidate.suggested,
    loss: candidate.loss,
  };
}

export function usePostGameTrainingOpportunity({ game, humanColor, finished, meta } = {}) {
  const [opportunity, setOpportunity] = useState(null);

  useEffect(() => {
    setOpportunity(null);
    if (!finished || !game?.id) return undefined;
    const controller = new AbortController();
    void preparePostGameTrainingOpportunity({ game, humanColor, meta, signal: controller.signal })
      .then((next) => { if (!controller.signal.aborted) setOpportunity(next); })
      .catch((error) => {
        if (!controller.signal.aborted && error?.name !== 'AbortError' && error?.cause?.name !== 'AbortError') setOpportunity(null);
      });
    return () => controller.abort();
  }, [finished, game?.id, humanColor]);

  return opportunity;
}

export function focusPostGameTrainingOpportunity(opportunity) {
  // The bank can change after analysis (quality retirement, another tab, reset).
  // Never send the post-game CTA to an unrelated adaptive fallback puzzle.
  const id = typeof opportunity?.puzzleId === 'string' ? opportunity.puzzleId : '';
  if (!id || !loadPersonalPuzzles().some((puzzle) => puzzle.id === id && !isPersonalPuzzleMastered(puzzle))) {
    return false;
  }
  return focusPersonalPuzzle(id);
}

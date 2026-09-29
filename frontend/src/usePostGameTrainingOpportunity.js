import { useEffect, useState } from 'react';
import { api } from './api.js';
import { analyzeGame } from './gameReport.js';
import { focusPersonalPuzzle, personalPuzzleFromMistake, savePersonalPuzzlesFromReport } from './personalPuzzles.js';

export async function preparePostGameTrainingOpportunity({ game, humanColor, meta = {}, signal } = {}) {
  if (!game?.id || !Array.isArray(game.history) || game.history.length === 0 || !humanColor) return null;
  const report = await analyzeGame(game.history, humanColor, api, {
    signal,
    initialFen: meta.initialFen || game.initialFen || null,
  });
  const candidate = (report?.topMistakes || [])
    .filter((move) => Number(move?.loss || 0) >= 80)
    .map((move) => personalPuzzleFromMistake(game.history, humanColor, move, meta))
    .find(Boolean) || null;
  if (!candidate) return null;

  savePersonalPuzzlesFromReport(game.history, humanColor, report, meta);
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
  return opportunity?.puzzleId ? focusPersonalPuzzle(opportunity.puzzleId) : false;
}

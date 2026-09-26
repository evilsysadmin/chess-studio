import { useEffect, useRef, useState } from 'react';
import { api } from './api.js';
import { analyzeGame, summarizeMoveReports } from './gameReport.js';
import { chessFromFen } from './chessRules.js';

function expectedHumanMoveIndices(finalGame, humanColor) {
  const history = Array.isArray(finalGame?.history) ? finalGame.history : [];
  let startTurn = 'w';
  if (finalGame?.initialFen) {
    const initial = chessFromFen(finalGame.initialFen);
    if (initial) startTurn = initial.turn();
  }
  return history
    .map((_, index) => index)
    .filter((index) => (index % 2 === 0 ? startTurn : (startTurn === 'w' ? 'b' : 'w')) === humanColor);
}

export function usePostGameRatingAudit({ gameId, humanColor, enabled, onGameEnd }) {
  const reportedResultRef = useRef(false);
  const generationRef = useRef(0);
  const rowsRef = useRef(new Map());
  const queueRef = useRef(Promise.resolve());
  const [analysisReport, setAnalysisReport] = useState(null);
  const [analysisPending, setAnalysisPending] = useState(false);

  useEffect(() => {
    reportedResultRef.current = false;
    generationRef.current += 1;
    rowsRef.current = new Map();
    queueRef.current = Promise.resolve();
    setAnalysisReport(null);
    setAnalysisPending(false);
  }, [gameId]);

  function queueConfirmedMove({ beforeHumanFen, humanMove, updated }) {
    if (!enabled || !updated?.history?.length || !beforeHumanFen) return;
    const cpuReplied = updated.lastMove?.by === 'cpu';
    const index = updated.history.length - (cpuReplied ? 2 : 1);
    const entry = updated.history[index] || humanMove;
    if (!entry || index < 0) return;
    const reply = cpuReplied ? updated.history[updated.history.length - 1] : null;
    const generation = generationRef.current;
    const miniHistory = reply ? [entry, reply] : [entry];

    queueRef.current = queueRef.current.catch(() => undefined).then(async () => {
      try {
        const mini = await analyzeGame(miniHistory, humanColor, api, { maxMoves: 1, initialFen: beforeHumanFen });
        const row = mini?.moveReports?.[0];
        if (!row || generation !== generationRef.current) return;
        rowsRef.current.set(index, { ...row, index, moveNumber: Math.floor(index / 2) + 1 });
      } catch {
        // El cierre completará el cuaderno si una llamada puntual falló.
      }
    });
  }

  async function finalize(finalGame) {
    if (!enabled || !finalGame?.history?.length) return null;
    await queueRef.current.catch(() => undefined);
    const expected = expectedHumanMoveIndices(finalGame, humanColor);
    const rows = [...rowsRef.current.values()]
      .filter((row) => {
        const played = finalGame.history?.[row.index];
        if (!played) return false;
        if (row.playedFrom && row.playedTo) {
          return row.playedFrom === played.from
            && row.playedTo === played.to
            && String(row.playedPromotion || '') === String(played.promotion || '');
        }
        return row.played === played.san;
      })
      .sort((a, b) => a.index - b.index);

    if (rows.length === expected.length) return summarizeMoveReports(rows);
    return analyzeGame(finalGame.history, humanColor, api, {
      maxMoves: Math.max(1, expected.length),
      initialFen: finalGame.initialFen || null,
    });
  }

  function reportCompletedGame(outcome, finalGame, endMeta = {}) {
    if (reportedResultRef.current) return;
    reportedResultRef.current = true;
    if (!enabled) {
      onGameEnd?.(outcome, finalGame, endMeta);
      return;
    }

    const generation = generationRef.current;
    setAnalysisPending(true);
    void finalize(finalGame)
      .then((report) => {
        if (generation !== generationRef.current) return;
        if (report) setAnalysisReport(report);
        onGameEnd?.(outcome, finalGame, { ...endMeta, analysisReport: report });
      })
      .catch(() => {
        if (generation === generationRef.current) onGameEnd?.(outcome, finalGame, endMeta);
      })
      .finally(() => {
        if (generation === generationRef.current) setAnalysisPending(false);
      });
  }

  return { enabled, reportedResultRef, analysisReport, analysisPending, queueConfirmedMove, reportCompletedGame };
}

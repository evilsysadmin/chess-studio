import { useEffect, useMemo, useState } from 'react';
import { clearCombatHistory, loadCombatHistory } from './combatHistory.js';
import { clearGameHistory, loadGameHistory } from './gameHistory.js';
import { computeInsights } from './insights.js';
import { HISTORY_GAME_OPEN_EVENT } from './historyNavigation.js';
import { loadRatingHistory } from './playerRating.js';

export function sortUnifiedHistory(historyList, combatHistoryList) {
  return [...historyList, ...combatHistoryList].sort((a, b) => new Date(b.date) - new Date(a.date));
}

export function findHistoryRecordByGameId(records = [], gameId = null) {
  if (gameId == null) return null;
  const target = String(gameId);
  return (Array.isArray(records) ? records : []).find((record) => (
    [record?.sourceGameId, record?.gameId, record?.id]
      .filter((value) => value != null)
      .some((value) => String(value) === target)
  )) || null;
}

export function useReplayLibrary({ navigateTo }) {
  const [historyList, setHistoryList] = useState(() => loadGameHistory());
  const [combatHistoryList, setCombatHistoryList] = useState(() => loadCombatHistory());
  const [replayRecord, setReplayRecord] = useState(null);
  const [combatReplayRecord, setCombatReplayRecord] = useState(null);
  const [replayInitialStep, setReplayInitialStep] = useState(undefined);
  const [pinnedReport, setPinnedReport] = useState(null);
  const [replayCrimeMode, setReplayCrimeMode] = useState(false);
  const [replayMovieMode, setReplayMovieMode] = useState(false);

  const allHistory = useMemo(() => sortUnifiedHistory(historyList, combatHistoryList), [historyList, combatHistoryList]);
  const insights = useMemo(() => computeInsights(historyList, combatHistoryList, loadRatingHistory()), [historyList, combatHistoryList]);

  function jumpToMove(record, kind, moveReport) {
    setReplayCrimeMode(false);
    setReplayInitialStep(moveReport.index + 1);
    setPinnedReport(moveReport);
    if (kind === 'combat') {
      setCombatReplayRecord(record);
      navigateTo('combatReplay');
    } else {
      setReplayRecord(record);
      navigateTo('replay');
    }
  }

  function openHistoryRecord(record) {
    if (!record) return false;
    setReplayMovieMode(false);
    setReplayCrimeMode(false);
    setReplayInitialStep(undefined);
    setPinnedReport(null);
    if (record.log) {
      setCombatReplayRecord(record);
      navigateTo('combatReplay');
    } else {
      setReplayRecord(record);
      navigateTo('replay');
    }
    return true;
  }

  function openHistoryRecordByGameId(gameId) {
    const record = findHistoryRecordByGameId(allHistory, gameId);
    if (!record) {
      navigateTo('history');
      return false;
    }
    return openHistoryRecord(record);
  }

  useEffect(() => {
    function handleHistoryGameOpen(event) {
      const gameId = event?.detail?.gameId;
      if (gameId != null) openHistoryRecordByGameId(gameId);
    }
    globalThis.addEventListener?.(HISTORY_GAME_OPEN_EVENT, handleHistoryGameOpen);
    return () => globalThis.removeEventListener?.(HISTORY_GAME_OPEN_EVENT, handleHistoryGameOpen);
    // allHistory is the source of truth for whether the physical plaque still
    // has a replayable source. navigateTo is supplied by App's stable router.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allHistory]);

  function clearAllHistory() {
    setHistoryList(clearGameHistory());
    setCombatHistoryList(clearCombatHistory());
  }

  function openMovie(record) {
    setReplayCrimeMode(false);
    setReplayInitialStep(0);
    setPinnedReport(null);
    setReplayRecord(record);
    setReplayMovieMode(true);
    navigateTo('replay');
  }

  return {
    historyList, setHistoryList, combatHistoryList, setCombatHistoryList,
    replayRecord, setReplayRecord, combatReplayRecord, setCombatReplayRecord,
    replayInitialStep, setReplayInitialStep, pinnedReport, setPinnedReport,
    replayCrimeMode, setReplayCrimeMode, replayMovieMode, setReplayMovieMode,
    allHistory, insights, jumpToMove, openHistoryRecord, openHistoryRecordByGameId, clearAllHistory, openMovie,
  };
}

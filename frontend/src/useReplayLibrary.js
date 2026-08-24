import { useMemo, useState } from 'react';
import { clearCombatHistory, loadCombatHistory } from './combatHistory.js';
import { clearGameHistory, loadGameHistory } from './gameHistory.js';
import { computeInsights } from './insights.js';
import { loadRatingHistory } from './playerRating.js';

export function sortUnifiedHistory(historyList, combatHistoryList) {
  return [...historyList, ...combatHistoryList].sort((a, b) => new Date(b.date) - new Date(a.date));
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
  }

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
    allHistory, insights, jumpToMove, openHistoryRecord, clearAllHistory, openMovie,
  };
}

import { useState } from 'react';

const DEFAULT_PUZZLE_LAUNCH = Object.freeze({
  source: 'curated',
  rush: false,
  filter: null,
  dailySlot: 'tactic',
});

export function usePuzzleLaunchFlow({ navigateTo, resetNavigation }) {
  const [puzzleLaunch, setPuzzleLaunch] = useState(DEFAULT_PUZZLE_LAUNCH);
  const [quickMatchLaunchNonce, setQuickMatchLaunchNonce] = useState(0);

  function openPuzzleMode(source = 'curated', rush = false, filter = null, dailySlot = 'tactic') {
    setPuzzleLaunch({ source, rush, filter, dailySlot });
    navigateTo('puzzle');
  }

  function openDailyChallengeSlot(slot = 'tactic') {
    openPuzzleMode('daily', false, null, slot);
  }

  function returnToQuickMatchFromPersonalTraining() {
    resetNavigation();
    setQuickMatchLaunchNonce((current) => current + 1);
  }

  return {
    puzzleLaunch,
    quickMatchLaunchNonce,
    openPuzzleMode,
    openDailyChallengeSlot,
    returnToQuickMatchFromPersonalTraining,
  };
}

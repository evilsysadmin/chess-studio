import { useState } from 'react';
import { STORAGE_SESSION, getStorageItem, removeStorageItem } from './safeStorage.js';
import {
  PERSONAL_PUZZLE_FOCUS_KEY, clearFocusedPuzzleResume, loadFocusedPuzzleResume, saveFocusedPuzzleResume,
} from './focusedPuzzleResume.js';

const DEFAULT_PUZZLE_LAUNCH = Object.freeze({
  source: 'curated',
  rush: false,
  filter: null,
  dailySlot: 'tactic',
  origin: null,
});

const DEFAULT_INSIGHTS_SECTION = 'diagnosis';

export function normalizeInsightsLandingSection(section) {
  return section === 'career' ? 'career' : DEFAULT_INSIGHTS_SECTION;
}

export function useLearningJourneyFlow({ navigateTo, resetNavigation }) {
  const [puzzleLaunch, setPuzzleLaunch] = useState(() => {
    const saved = loadFocusedPuzzleResume();
    return saved ? { source: 'personal', rush: false, filter: saved.filter, dailySlot: 'tactic', origin: saved.origin } : DEFAULT_PUZZLE_LAUNCH;
  });
  const [quickMatchLaunchNonce, setQuickMatchLaunchNonce] = useState(0);
  const [insightsLandingSection, setInsightsLandingSection] = useState(DEFAULT_INSIGHTS_SECTION);

  function openPuzzleMode(source = 'curated', rush = false, filter = null, dailySlot = 'tactic', origin = null) {
    clearFocusedPuzzleResume();
    if (source === 'personal' && !rush && ['insights-action', 'postgame-error'].includes(origin)) {
      const focusedId = getStorageItem(STORAGE_SESSION, PERSONAL_PUZZLE_FOCUS_KEY);
      // Capture the exact target before the one-shot focus is consumed.
      // If persistence fails, leave it available to the existing live launch.
      if (saveFocusedPuzzleResume({ puzzleId: focusedId, origin, filter })) {
        removeStorageItem(STORAGE_SESSION, PERSONAL_PUZZLE_FOCUS_KEY);
      }
    }
    setPuzzleLaunch({ source, rush, filter, dailySlot, origin });
    navigateTo('puzzle');
  }

  function openPersonalTraining(filter = null, origin = null) {
    openPuzzleMode('personal', false, filter, 'tactic', origin);
  }

  function openDailyChallengeSlot(slot = 'tactic') {
    openPuzzleMode('daily', false, null, slot);
  }

  function openInsights(section = DEFAULT_INSIGHTS_SECTION) {
    setInsightsLandingSection(normalizeInsightsLandingSection(section));
    navigateTo('insights');
  }

  function returnToQuickMatchFromPersonalTraining() {
    clearFocusedPuzzleResume();
    resetNavigation();
    setQuickMatchLaunchNonce((current) => current + 1);
  }

  return {
    puzzleLaunch,
    quickMatchLaunchNonce,
    insightsLandingSection,
    openPuzzleMode,
    openPersonalTraining,
    openDailyChallengeSlot,
    openInsights,
    returnToQuickMatchFromPersonalTraining,
  };
}

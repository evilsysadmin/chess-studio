import { useState } from 'react';

const DEFAULT_PUZZLE_LAUNCH = Object.freeze({
  source: 'curated',
  rush: false,
  filter: null,
  dailySlot: 'tactic',
});

const DEFAULT_INSIGHTS_SECTION = 'diagnosis';

export function normalizeInsightsLandingSection(section) {
  return section === 'career' ? 'career' : DEFAULT_INSIGHTS_SECTION;
}

export function useLearningJourneyFlow({ navigateTo, resetNavigation }) {
  const [puzzleLaunch, setPuzzleLaunch] = useState(DEFAULT_PUZZLE_LAUNCH);
  const [quickMatchLaunchNonce, setQuickMatchLaunchNonce] = useState(0);
  const [insightsLandingSection, setInsightsLandingSection] = useState(DEFAULT_INSIGHTS_SECTION);

  function openPuzzleMode(source = 'curated', rush = false, filter = null, dailySlot = 'tactic') {
    setPuzzleLaunch({ source, rush, filter, dailySlot });
    navigateTo('puzzle');
  }

  function openPersonalTraining(filter = null) {
    openPuzzleMode('personal', false, filter);
  }

  function openDailyChallengeSlot(slot = 'tactic') {
    openPuzzleMode('daily', false, null, slot);
  }

  function openInsights(section = DEFAULT_INSIGHTS_SECTION) {
    setInsightsLandingSection(normalizeInsightsLandingSection(section));
    navigateTo('insights');
  }

  function returnToQuickMatchFromPersonalTraining() {
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

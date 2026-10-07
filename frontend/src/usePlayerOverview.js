import { useEffect, useState } from 'react';
import { scheduleAchievementCheck } from './achievementBootstrap.js';
import { loadCombatHistory } from './combatHistory.js';
import { loadRoster as loadCombatRoster } from './combatRoster.js';
import { loadCombatService, summarizeCombatService } from './combatService.js';
import { loadRating } from './playerRating.js';

export function combatOverviewFrom(roster = {}, service = {}) {
  return {
    credits: roster.credits || 0,
    rank: service.rank,
    nextProgress: service.nextProgress,
  };
}

function loadCombatOverview() {
  return combatOverviewFrom(
    loadCombatRoster(),
    summarizeCombatService(loadCombatService()),
  );
}

export function usePlayerOverview(view, { onCombatHistory } = {}) {
  const [rating, setRating] = useState(() => loadRating());
  const [combatOverview, setCombatOverview] = useState(() => loadCombatOverview());

  useEffect(() => {
    setRating(loadRating());
    setCombatOverview(loadCombatOverview());
    onCombatHistory?.(loadCombatHistory());
    void scheduleAchievementCheck();
  }, [view, onCombatHistory]);

  return { rating, setRating, combatOverview };
}

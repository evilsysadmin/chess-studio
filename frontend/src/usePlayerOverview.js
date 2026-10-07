import { useEffect, useState } from 'react';
import { loadCombatHistory } from './combatHistory.js';
import { loadRoster as loadCombatRoster } from './combatRoster.js';
import { loadCombatService, summarizeCombatService } from './combatService.js';
import { loadRating } from './playerRating.js';

function loadCombatOverview() {
  const roster = loadCombatRoster();
  const service = summarizeCombatService(loadCombatService());
  return {
    credits: roster.credits || 0,
    rank: service.rank,
    nextProgress: service.nextProgress,
  };
}

export function usePlayerOverview(view, onCombatHistory) {
  const [rating, setRating] = useState(loadRating);
  const [combatOverview, setCombatOverview] = useState(loadCombatOverview);

  useEffect(() => {
    setRating(loadRating());
    setCombatOverview(loadCombatOverview());
    onCombatHistory(loadCombatHistory());
    void import('./achievementBootstrap.js').then(({ scheduleAchievementCheck }) => scheduleAchievementCheck());
  }, [view, onCombatHistory]);

  return { rating, setRating, combatOverview };
}

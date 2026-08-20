// resetProgress.js — Un solo "empezar de cero" que junta todos los resets
// individuales que ya existían sueltos por distintos módulos. A propósito
// NO toca: la sesión de login (`chess-study-auth-*`, cerraría tu cuenta,
// no es "progreso"), las preferencias de audio/voz (son ajustes de UI, no
// avance), ni la partida activa (`chess-study-active-game-learning`, es
// efímera por diseño, ya no sincroniza a propósito).

import { resetTournament } from './tournament.js';
import { clearGameHistory } from './gameHistory.js';
import { clearCombatHistory } from './combatHistory.js';
import { resetRoster } from './combatRoster.js';
import { resetRating, resetRatingHistory } from './playerRating.js';
import { resetAchievements } from './achievements.js';
import { resetAllPuzzleStats } from './puzzleStats.js';
import { clearWorstMoveCache } from './worstMoveCache.js';
import { resetRewardsSelection } from './tournamentRewards.js';
import { resetRoguelikeRun } from './roguelikeRun.js';

export function resetAllProgress() {
  resetTournament();
  clearGameHistory();
  clearCombatHistory();
  resetRoster();
  resetRating();
  resetRatingHistory();
  resetAchievements();
  resetAllPuzzleStats();
  clearWorstMoveCache();
  resetRewardsSelection();
  resetRoguelikeRun();
}

import { difficultyLabel } from './difficulty.js';
import { PROVISIONAL_GAMES } from './playerRating.js';
import { difficultyForQuickMatchRating } from './quickMatchDifficulty.js';

function normalizedGames(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 0;
  return Math.max(0, Math.floor(numeric));
}

export function adaptiveDifficultyPresentation(ratingState = {}, activity = null) {
  const games = normalizedGames(ratingState?.games);
  const completed = Math.min(games, PROVISIONAL_GAMES);
  const level = difficultyForQuickMatchRating(ratingState?.rating ?? 400, activity, games);
  const calibrating = games < PROVISIONAL_GAMES;

  if (calibrating) {
    return {
      level,
      calibrating,
      completed,
      choiceCopy: `Calibrando ${completed}/${PROVISIONAL_GAMES} · Matthias ajusta la siguiente partida, nunca ésta`,
      detailLabel: `Dificultad automática · Calibrando ${completed}/${PROVISIONAL_GAMES}`,
    };
  }

  return {
    level,
    calibrating,
    completed,
    choiceCopy: 'Reto adaptativo · Matthias intenta mantenerse ligeramente por encima de tu nivel',
    detailLabel: `Dificultad automática · ${difficultyLabel(level)}`,
  };
}

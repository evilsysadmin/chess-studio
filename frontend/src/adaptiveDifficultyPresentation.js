import { difficultyLabel } from './difficulty.js';
import { loadGameActivity } from './gameActivity.js';
import { loadCleanGameRecords } from './cleanGames.js';
import { PROVISIONAL_GAMES, cpuRatingForDifficulty } from './playerRating.js';
import {
  difficultyForQuickMatchRating,
  quickMatchQualityAdjustment,
  quickMatchRecentFormAdjustment,
} from './quickMatchDifficulty.js';

function normalizedGames(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 0;
  return Math.max(0, Math.floor(numeric));
}

export function adaptiveDifficultyPresentation(ratingState = {}, activity = null, qualityRecords = null) {
  const games = normalizedGames(ratingState?.games);
  const completed = Math.min(games, PROVISIONAL_GAMES);
  const recent = activity == null ? loadGameActivity() : activity;
  const quality = qualityRecords == null ? loadCleanGameRecords() : qualityRecords;
  const level = difficultyForQuickMatchRating(ratingState?.rating ?? 400, recent, games, quality);
  const calibrating = games < PROVISIONAL_GAMES;
  const playerRating = Number(ratingState?.rating ?? 400);
  const ceilingLimited = !calibrating
    && level >= 100
    && Number.isFinite(playerRating)
    && playerRating >= cpuRatingForDifficulty(100);
  const formAdjustment = quickMatchRecentFormAdjustment(recent, games);
  const qualityAdjustment = quickMatchQualityAdjustment(recent, games, quality);
  const activeSignals = [
    'rating',
    ...(formAdjustment ? ['forma reciente'] : []),
    ...(qualityAdjustment ? ['partidas analizadas'] : []),
  ];
  const evidenceCopy = `Señales activas: ${activeSignals.join(' · ')}.`;

  if (calibrating) {
    return {
      level,
      calibrating,
      completed,
      choiceCopy: `Calibrando ${completed}/${PROVISIONAL_GAMES} · Matthias ajusta la siguiente partida, nunca ésta`,
      detailLabel: `Dificultad automática · Calibrando ${completed}/${PROVISIONAL_GAMES}`,
      evidenceCopy: 'Señal activa: rating provisional. La forma reciente sólo suaviza la siguiente partida cuando ya existe evidencia.',
    };
  }

  return {
    level,
    calibrating,
    completed,
    ceilingLimited,
    choiceCopy: ceilingLimited
      ? 'Reto adaptativo · Matthias ya está al máximo disponible'
      : 'Reto adaptativo · Matthias intenta mantenerse ligeramente por encima de tu nivel',
    detailLabel: `Dificultad automática · ${difficultyLabel(level)}${ceilingLimited ? ' · máximo disponible' : ''}`,
    evidenceCopy,
  };
}

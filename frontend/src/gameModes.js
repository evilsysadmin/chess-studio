import { combatRecordModeLabel } from './combatChessBrand.js';

export const GAME_MODE_LABELS = Object.freeze({
  tournament: 'Torneo',
  practice: 'Práctica',
  casual: 'Partida rápida',
  ghost: 'Rival Fantasma',
  lab: 'Laboratorio',
  rescue: 'Rescate legacy', // compatibilidad con partidas creadas antes de retirar la resurrección del Cementerio
  sudden: 'Muerte súbita',
  cup: 'Copa de 8',
  boss: 'Boss Run',
  streak: 'Racha',
  'nemesis-training': 'Némesis',
});

export function combatModeLabel(record = {}) {
  return combatRecordModeLabel(record);
}

export function gameModeLabel(record = {}) {
  return combatModeLabel(record) || GAME_MODE_LABELS[String(record?.mode || 'casual')] || 'Partida';
}

export function gameModeFromContext({ learningMode = false, gameContext = {} } = {}) {
  if (gameContext?.suddenDeath) return 'sudden';
  if (gameContext?.rescue) return 'rescue';
  if (gameContext?.lab) return 'lab';
  if (gameContext?.runMode === 'cup') return 'cup';
  if (gameContext?.runMode === 'boss') return 'boss';
  if (gameContext?.runMode === 'streak') return 'streak';
  if (gameContext?.ghost) return 'ghost';
  return learningMode ? 'practice' : 'casual';
}

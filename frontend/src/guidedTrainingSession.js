import { STORAGE_SESSION, readJsonStorage, removeStorageItem, writeJsonStorage } from './safeStorage.js';
import { getUsername } from './auth.js';
import { buildNemesisDossier } from './nemesis.js';
import { loadPersonalPuzzles } from './personalPuzzles.js';
import { loadCleanGameRecords } from './cleanGames.js';
import { buildPlayerModel, PATTERN_IMPROVEMENT_STATES } from './playerModel.js';
import { loadRivalry } from './rivalry.js';

export const GUIDED_TRAINING_SESSION_KEY = 'chess-study-guided-training-session-v1';
const SESSION_SCHEMA = 1;
const MAX_SESSION_AGE_MS = 4 * 60 * 60 * 1000;
const INITIAL_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

function sessionOwner() {
  return String(getUsername() || '').trim().toLowerCase() || null;
}

function normalizeDuration(value) {
  const minutes = Number(value);
  if (minutes === 5 || minutes === 30) return minutes;
  return 15;
}

function pendingPersonalPuzzles(puzzles = []) {
  return (Array.isArray(puzzles) ? puzzles : []).filter((puzzle) => (
    !puzzle?.masteredAt && Number(puzzle?.cleanSolves || 0) <= 0
  ));
}

function actionableRecurringPattern(playerModel) {
  return (Array.isArray(playerModel?.recurringErrors) ? playerModel.recurringErrors : []).find((pattern) => {
    if (pattern?.improvementState === PATTERN_IMPROVEMENT_STATES.STILL_OCCURRING) return true;
    if ([
      PATTERN_IMPROVEMENT_STATES.PROBABLE_IMPROVEMENT,
      PATTERN_IMPROVEMENT_STATES.CORRECTED_WITH_SUFFICIENT_SAMPLE,
    ].includes(pattern?.improvementState)) return false;
    return pattern?.debt?.active === true;
  }) || null;
}

function recurringPatternFocus(pattern) {
  const debt = pattern?.debt;
  const relapse = pattern?.improvementState === PATTERN_IMPROVEMENT_STATES.STILL_OCCURRING && debt?.paid === true;
  const recurrenceGames = Math.max(0, Number(pattern?.postTrainingObservations?.recurrenceGames || 0));
  const label = pattern?.label || String(pattern?.incidentKey || '').replace(/^(human|cpu):/, '').replaceAll('_', ' ').toLowerCase();
  return {
    id: `debt:${pattern.incidentKey}`,
    kind: 'debt',
    title: relapse ? `Recaída detectada: ${label}` : `Ataca la deuda: ${label}`,
    detail: relapse
      ? `El patrón reapareció en ${recurrenceGames || 1} ${recurrenceGames === 1 ? 'partida observada' : 'partidas observadas'} después del entrenamiento. Vuelve a una posición real antes de darlo por cerrado.`
      : `${Number(debt?.progress || 0)}/${Number(debt?.target || 2)} casos limpios · ${Number(debt?.realCases || pattern?.positions || 0)} posiciones reales en el expediente.`,
    action: 'personal-filter',
    filter: pattern?.filter || { incidentKey: pattern.incidentKey },
  };
}

function focusStep(puzzles, playerModel) {
  const pattern = actionableRecurringPattern(playerModel);
  if (pattern) return recurringPatternFocus(pattern);

  // Compatibilidad con modelos parciales/antiguos: si aún no traen
  // recurringErrors, conserva la deuda factual existente como fallback.
  if (!Array.isArray(playerModel?.recurringErrors)) {
    const debt = playerModel?.trainingDebt?.top;
    if (debt) {
      return {
        id: `debt:${debt.incidentKey}`,
        kind: 'debt',
        title: `Ataca la deuda: ${debt.label}`,
        detail: `${debt.progress}/${debt.target} casos limpios · ${debt.cases} posiciones reales en el expediente.`,
        action: 'personal-filter',
        filter: { incidentKey: debt.incidentKey },
      };
    }
  }

  const pending = pendingPersonalPuzzles(puzzles);
  if (!pending.length) return null;
  return {
    id: 'personal-errors',
    kind: 'personal-errors',
    title: 'Tus crímenes pendientes',
    detail: `${pending.length} ${pending.length === 1 ? 'posición real pendiente' : 'posiciones reales pendientes'} para trabajar sin inventar deberes.`,
    action: 'personal',
  };
}

function nemesisStep(history, rivalry) {
  const dossier = buildNemesisDossier(history, rivalry);
  if (!dossier?.opening || !dossier?.training) return null;
  const training = dossier.training;
  return {
    id: `nemesis:${dossier.opening.opening}:${dossier.opening.humanColor}`,
    kind: 'nemesis',
    title: `Némesis: ${dossier.opening.opening}`,
    detail: `${dossier.opening.games} partidas · ${dossier.opening.scorePct}% de puntuación. Rejuega una posición real de una derrota, sin rating.`,
    action: 'nemesis-position',
    training: {
      fen: training.fen,
      humanColor: training.humanColor,
      difficulty: training.difficulty,
      moveNumber: training.moveNumber,
      sourceRecordId: training.sourceRecord?.id || null,
    },
    opening: dossier.opening.opening,
  };
}

function recentPracticeDifficulty(history = []) {
  const rows = (Array.isArray(history) ? history : [])
    .filter((row) => Number.isFinite(Number(row?.difficulty)))
    .slice(-5);
  if (!rows.length) return 50;
  return Math.max(5, Math.min(95, Math.round(rows.reduce((sum, row) => sum + Number(row.difficulty), 0) / rows.length)));
}

function recentHumanColor(history = []) {
  const row = [...(Array.isArray(history) ? history : [])].reverse().find((entry) => ['w', 'b'].includes(entry?.humanColor));
  return row?.humanColor || 'w';
}

function allocateDurations(minutes, hasFocus, hasNemesis) {
  if (minutes === 5) {
    if (hasFocus) return { focus: 4, nemesis: 0, game: 0, review: 1 };
    return { focus: 0, nemesis: hasNemesis ? 4 : 0, game: 0, review: 1 };
  }
  if (minutes === 30) {
    if (hasFocus && hasNemesis) return { focus: 10, nemesis: 8, game: 8, review: 4 };
    return { focus: hasFocus ? 16 : 0, nemesis: hasNemesis ? 16 : 0, game: 10, review: 4 };
  }
  if (hasFocus && hasNemesis) return { focus: 5, nemesis: 4, game: 5, review: 1 };
  return { focus: hasFocus ? 8 : 0, nemesis: hasNemesis ? 8 : 0, game: 6, review: 1 };
}

export function buildGuidedTrainingPlan({
  minutes = 15,
  history = [],
  puzzles = loadPersonalPuzzles(),
  rivalry = loadRivalry(),
  playerModel = null,
  cleanGameRecords = null,
} = {}) {
  const duration = normalizeDuration(minutes);
  const model = playerModel || buildPlayerModel({
    personalPuzzles: puzzles,
    cleanGameRecords: cleanGameRecords ?? loadCleanGameRecords(),
  });
  const focus = focusStep(puzzles, model);
  const nemesis = nemesisStep(history, rivalry);
  if (!focus && !nemesis) {
    return {
      minutes: duration,
      available: false,
      reason: 'Aún no hay errores personales o una Némesis con muestra suficiente para montar una sesión honesta.',
      steps: [],
    };
  }

  const allocation = allocateDurations(duration, Boolean(focus), Boolean(nemesis));
  const steps = [];
  if (focus && allocation.focus > 0) steps.push({ ...focus, minutes: allocation.focus });
  if (nemesis && allocation.nemesis > 0) steps.push({ ...nemesis, minutes: allocation.nemesis });
  if (allocation.game > 0) {
    steps.push({
      id: 'short-practice-game',
      kind: 'short-game',
      title: 'Partida corta de práctica',
      detail: 'Desde la posición inicial, sin rating. Usa sólo el presupuesto de este bloque y vuelve al recorrido al terminar.',
      action: 'short-game',
      training: {
        fen: INITIAL_FEN,
        humanColor: recentHumanColor(history),
        difficulty: recentPracticeDifficulty(history),
      },
      minutes: allocation.game,
    });
  }
  steps.push({
    id: 'review',
    kind: 'review',
    title: 'Cierre rápido',
    detail: 'Vuelve a Así juegas y comprueba qué sigue pendiente. La sesión no inventa una mejora si no hay datos nuevos.',
    action: 'review',
    minutes: allocation.review,
  });

  return { minutes: duration, available: true, reason: null, steps };
}

function normalizeStoredSession(value, now = Date.now()) {
  if (!value || value.schema !== SESSION_SCHEMA || !Array.isArray(value.steps) || !value.steps.length) return null;
  if ((value.owner || null) !== sessionOwner()) return null;
  const startedAt = Number(value.startedAt || 0);
  if (!startedAt || now - startedAt > MAX_SESSION_AGE_MS || startedAt - now > 60_000) return null;
  const currentIndex = Math.max(0, Math.min(value.steps.length - 1, Math.floor(Number(value.currentIndex) || 0)));
  return {
    schema: SESSION_SCHEMA,
    id: String(value.id || `guided-${startedAt}`),
    owner: value.owner || null,
    minutes: normalizeDuration(value.minutes),
    startedAt,
    currentIndex,
    steps: value.steps,
  };
}

export function loadGuidedTrainingSession({ now = Date.now() } = {}) {
  const parsed = readJsonStorage(STORAGE_SESSION, GUIDED_TRAINING_SESSION_KEY, { fallback: null });
  const normalized = normalizeStoredSession(parsed, Number(now));
  if (!normalized) removeStorageItem(STORAGE_SESSION, GUIDED_TRAINING_SESSION_KEY);
  return normalized;
}

export function startGuidedTrainingSession(plan, { now = Date.now() } = {}) {
  if (!plan?.available || !Array.isArray(plan.steps) || !plan.steps.length) return null;
  const startedAt = Number(now);
  const session = {
    schema: SESSION_SCHEMA,
    id: `guided-${startedAt}-${plan.minutes}`,
    owner: sessionOwner(),
    minutes: normalizeDuration(plan.minutes),
    startedAt,
    currentIndex: 0,
    steps: plan.steps,
  };
  writeJsonStorage(STORAGE_SESSION, GUIDED_TRAINING_SESSION_KEY, session);
  return session;
}

export function advanceGuidedTrainingSession(session, { now = Date.now() } = {}) {
  const normalized = normalizeStoredSession(session, Number(now));
  if (!normalized) return null;
  const nextIndex = normalized.currentIndex + 1;
  if (nextIndex >= normalized.steps.length) {
    removeStorageItem(STORAGE_SESSION, GUIDED_TRAINING_SESSION_KEY);
    return null;
  }
  const next = { ...normalized, currentIndex: nextIndex };
  writeJsonStorage(STORAGE_SESSION, GUIDED_TRAINING_SESSION_KEY, next);
  return next;
}

export function clearGuidedTrainingSession() {
  removeStorageItem(STORAGE_SESSION, GUIDED_TRAINING_SESSION_KEY);
}

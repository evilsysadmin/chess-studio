import { STORAGE_SESSION, getStorageItem, removeStorageItem, setStorageItem } from './safeStorage.js';
import { buildNemesisDossier } from './nemesis.js';
import { loadPersonalPuzzles } from './personalPuzzles.js';
import { loadRivalry } from './rivalry.js';
import { personalTrainingDebtSummary } from './trainingDebt.js';

export const GUIDED_TRAINING_SESSION_KEY = 'chess-study-guided-training-session-v1';
const SESSION_SCHEMA = 1;
const MAX_SESSION_AGE_MS = 4 * 60 * 60 * 1000;

function pendingPersonalPuzzles(puzzles = []) {
  return (Array.isArray(puzzles) ? puzzles : []).filter((puzzle) => (
    !puzzle?.masteredAt && Number(puzzle?.cleanSolves || 0) <= 0
  ));
}

function focusStep(puzzles) {
  const debt = personalTrainingDebtSummary(puzzles).top;
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
  return {
    id: `nemesis:${dossier.opening.opening}:${dossier.opening.humanColor}`,
    kind: 'nemesis',
    title: `Némesis: ${dossier.opening.opening}`,
    detail: `${dossier.opening.games} partidas · ${dossier.opening.scorePct}% de puntuación. Rejuega una posición real de una derrota, sin rating.`,
    action: 'nemesis-position',
    training: dossier.training,
    opening: dossier.opening.opening,
  };
}

function allocateDurations(minutes, hasFocus, hasNemesis) {
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
} = {}) {
  const duration = Number(minutes) === 30 ? 30 : 15;
  const focus = focusStep(puzzles);
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
  if (focus) steps.push({ ...focus, minutes: allocation.focus });
  if (nemesis) steps.push({ ...nemesis, minutes: allocation.nemesis });
  steps.push({
    id: 'short-practice-game',
    kind: 'short-game',
    title: 'Partida corta de práctica',
    detail: '5+0 contra Matthias, sin rating. La idea es transferir lo entrenado al tablero, no farmear puntos.',
    action: 'short-game',
    minutes: allocation.game,
  });
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
  const startedAt = Number(value.startedAt || 0);
  if (!startedAt || now - startedAt > MAX_SESSION_AGE_MS || startedAt - now > 60_000) return null;
  const currentIndex = Math.max(0, Math.min(value.steps.length - 1, Math.floor(Number(value.currentIndex) || 0)));
  return {
    schema: SESSION_SCHEMA,
    id: String(value.id || `guided-${startedAt}`),
    minutes: Number(value.minutes) === 30 ? 30 : 15,
    startedAt,
    currentIndex,
    steps: value.steps,
  };
}

export function loadGuidedTrainingSession({ now = Date.now() } = {}) {
  try {
    const parsed = JSON.parse(getStorageItem(STORAGE_SESSION, GUIDED_TRAINING_SESSION_KEY) || 'null');
    const normalized = normalizeStoredSession(parsed, Number(now));
    if (!normalized) removeStorageItem(STORAGE_SESSION, GUIDED_TRAINING_SESSION_KEY);
    return normalized;
  } catch {
    removeStorageItem(STORAGE_SESSION, GUIDED_TRAINING_SESSION_KEY);
    return null;
  }
}

export function startGuidedTrainingSession(plan, { now = Date.now() } = {}) {
  if (!plan?.available || !Array.isArray(plan.steps) || !plan.steps.length) return null;
  const startedAt = Number(now);
  const session = {
    schema: SESSION_SCHEMA,
    id: `guided-${startedAt}-${plan.minutes}`,
    minutes: plan.minutes,
    startedAt,
    currentIndex: 0,
    steps: plan.steps,
  };
  setStorageItem(STORAGE_SESSION, GUIDED_TRAINING_SESSION_KEY, JSON.stringify(session));
  return session;
}

export function advanceGuidedTrainingSession(session) {
  const normalized = normalizeStoredSession(session);
  if (!normalized) return null;
  const nextIndex = normalized.currentIndex + 1;
  if (nextIndex >= normalized.steps.length) {
    removeStorageItem(STORAGE_SESSION, GUIDED_TRAINING_SESSION_KEY);
    return null;
  }
  const next = { ...normalized, currentIndex: nextIndex };
  setStorageItem(STORAGE_SESSION, GUIDED_TRAINING_SESSION_KEY, JSON.stringify(next));
  return next;
}

export function clearGuidedTrainingSession() {
  removeStorageItem(STORAGE_SESSION, GUIDED_TRAINING_SESSION_KEY);
}

import { buildNemesisDossier } from './nemesis.js';
import { isPersonalPuzzleMastered, loadPersonalPuzzles, matchesPersonalPuzzleFilter } from './personalPuzzles.js';
import { loadCleanGameRecords } from './cleanGameRecords.js';
import { buildPlayerModel, PATTERN_IMPROVEMENT_STATES } from './playerModel.js';
import { loadRivalry } from './rivalry.js';

import { normalizeDuration } from './guidedTrainingSessionStore.js';
export {
  GUIDED_TRAINING_SESSION_KEY,
  loadGuidedTrainingSession,
  startGuidedTrainingSession,
  advanceGuidedTrainingSession,
  isCurrentGuidedTrainingStep,
  clearGuidedTrainingSession,
} from './guidedTrainingSessionStore.js';

const INITIAL_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

function nonActionablePatternIncidentKeys(playerModel) {
  return new Set((Array.isArray(playerModel?.recurringErrors) ? playerModel.recurringErrors : [])
    .filter((pattern) => (
      pattern?.improvementState !== PATTERN_IMPROVEMENT_STATES.STILL_OCCURRING
      && pattern?.debt?.active !== true
      && (
        pattern?.debt?.paid === true
        || [
          PATTERN_IMPROVEMENT_STATES.PROBABLE_IMPROVEMENT,
          PATTERN_IMPROVEMENT_STATES.CORRECTED_WITH_SUFFICIENT_SAMPLE,
        ].includes(pattern?.improvementState)
      )
    ))
    .map((pattern) => pattern?.incidentKey)
    .filter(Boolean));
}

function pendingPersonalPuzzles(puzzles = [], playerModel = null) {
  const suppressedKeys = nonActionablePatternIncidentKeys(playerModel);
  return (Array.isArray(puzzles) ? puzzles : []).filter((puzzle) => {
    if (isPersonalPuzzleMastered(puzzle) || Number(puzzle?.cleanSolves || 0) > 0) return false;
    const incidentKeys = Array.isArray(puzzle?.incidentKeys) ? puzzle.incidentKeys.filter(Boolean) : [];
    if (!incidentKeys.length || !suppressedKeys.size) return true;
    return incidentKeys.some((incidentKey) => !suppressedKeys.has(incidentKey));
  });
}

function actionableRecurringPattern(playerModel, pending) {
  return (Array.isArray(playerModel?.recurringErrors) ? playerModel.recurringErrors : []).find((pattern) => {
    const filter = pattern?.filter || { incidentKey: pattern?.incidentKey };
    if (!pending.some((puzzle) => matchesPersonalPuzzleFilter(puzzle, filter))) return false;
    if (pattern?.improvementState === PATTERN_IMPROVEMENT_STATES.STILL_OCCURRING) return true;
    if ([
      PATTERN_IMPROVEMENT_STATES.PROBABLE_IMPROVEMENT,
      PATTERN_IMPROVEMENT_STATES.CORRECTED_WITH_SUFFICIENT_SAMPLE,
    ].includes(pattern?.improvementState)) return false;
    return pattern?.debt?.active === true;
  }) || null;
}

function recurringPatternFocus(pattern, featuredPuzzleId) {
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
    featuredPuzzleId,
  };
}

function focusStep(puzzles, playerModel) {
  const pending = pendingPersonalPuzzles(puzzles, playerModel);
  const pattern = actionableRecurringPattern(playerModel, pending);
  if (pattern) {
    const filter = pattern.filter || { incidentKey: pattern.incidentKey };
    const featured = pending.find((puzzle) => matchesPersonalPuzzleFilter(puzzle, filter));
    return recurringPatternFocus(pattern, featured?.id || null);
  }

  // Compatibilidad con modelos parciales/antiguos: si aún no traen
  // recurringErrors, conserva la deuda factual existente como fallback.
  if (!Array.isArray(playerModel?.recurringErrors)) {
    const debt = playerModel?.trainingDebt?.top;
    if (debt?.incidentKey && pending.some((puzzle) => matchesPersonalPuzzleFilter(puzzle, { incidentKey: debt.incidentKey }))) {
      return {
        id: `debt:${debt.incidentKey}`,
        kind: 'debt',
        title: `Ataca la deuda: ${debt.label}`,
        detail: `${debt.progress}/${debt.target} casos limpios · ${debt.cases} posiciones reales en el expediente.`,
        action: 'personal-filter',
        filter: { incidentKey: debt.incidentKey },
        featuredPuzzleId: pending.find((puzzle) => matchesPersonalPuzzleFilter(puzzle, { incidentKey: debt.incidentKey }))?.id || null,
      };
    }
  }

  if (!pending.length) return null;
  return {
    id: 'personal-errors',
    kind: 'personal-errors',
    title: 'Acciones inmediatas',
    detail: `${pending.length} ${pending.length === 1 ? 'posición real pendiente' : 'posiciones reales pendientes'} para trabajar sin inventar deberes.`,
    action: 'personal',
    featuredPuzzleId: pending[0]?.id || null,
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

// gameHistory.saveGameRecord unshifts: history is newest first. Keep difficulty
// and color on the same chronological end rather than sampling old matches.
// CPU level 0 is real evidence: the 5..95 practice floor applies only after
// computing the sample, not by throwing away those games as missing.
function recentPracticeDifficulty(history = []) {
  const values = (Array.isArray(history) ? history : [])
    .map((row) => row?.difficulty)
    .filter((value) => value !== null && value !== undefined
      && typeof value !== 'boolean' && String(value).trim() !== ''
      && Number.isFinite(Number(value)) && Number(value) >= 0 && Number(value) <= 100)
    .slice(0, 5)
    .map(Number);
  if (!values.length) return 50;
  return Math.max(5, Math.min(95, Math.round(values.reduce((sum, value) => sum + value, 0) / values.length)));
}

function recentHumanColor(history = []) {
  const row = (Array.isArray(history) ? history : []).find((entry) => ['w', 'b'].includes(entry?.humanColor));
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
  minutes = 5,
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


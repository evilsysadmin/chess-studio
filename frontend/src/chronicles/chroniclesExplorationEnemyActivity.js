import { chroniclesActiveEnemies } from '../chroniclesOfMatthias.js';
import {
  chroniclesChooseEnemyStep,
  chroniclesRuntimeEnemyPosition,
} from '../chroniclesOfMatthiasTurns.js';

export const CHRONICLES_EXPLORATION_ENEMY_STEP_INTERVAL = 3;
export const CHRONICLES_EXPLORATION_SEARCH_ACTIVATIONS = 2;
const CHRONICLES_EXPLORATION_AWARENESS_PADDING = 2;

function partyChangedCell(previous, next) {
  return Number(previous?.x) !== Number(next?.x) || Number(previous?.y) !== Number(next?.y);
}

function explorationEnemyStepCount(state) {
  const value = Number(state?.explorationEnemySteps);
  return Number.isInteger(value) && value >= 0 ? value : 0;
}

function manhattanDistance(left, right) {
  return Math.abs(Number(left?.x) - Number(right?.x))
    + Math.abs(Number(left?.y) - Number(right?.y));
}

function explorationAwarenessRange(enemy) {
  const engageRange = Number(enemy?.ai?.engageRange);
  if (
    !enemy?.ai?.engagedMovement
    || !Number.isFinite(engageRange)
    || engageRange < 1
    || enemy?.ai?.movement === 'patrol-route'
  ) {
    return null;
  }
  return engageRange + CHRONICLES_EXPLORATION_AWARENESS_PADDING;
}

function normalizedMemory(state, enemyId) {
  const memory = state?.enemyExplorationAwareness?.[enemyId];
  if (!memory || !['chase', 'search'].includes(memory.mode)) return null;
  const x = Number(memory.lastKnown?.x);
  const y = Number(memory.lastKnown?.y);
  const remaining = Number(memory.remaining);
  if (!Number.isInteger(x) || !Number.isInteger(y)) return null;
  if (!Number.isInteger(remaining) || remaining < 0) return null;
  return {
    mode: memory.mode,
    lastKnown: { x, y },
    remaining,
  };
}

function awarenessDecision(state, enemy, from) {
  const awarenessRange = explorationAwarenessRange(enemy);
  if (awarenessRange === null) return null;

  const party = { x: Number(state.x), y: Number(state.y) };
  if (manhattanDistance(from, party) <= awarenessRange) {
    return {
      mode: 'chase',
      lastKnown: party,
      remaining: CHRONICLES_EXPLORATION_SEARCH_ACTIVATIONS,
    };
  }

  const previous = normalizedMemory(state, enemy.id);
  if (previous?.mode === 'chase') {
    return {
      mode: 'search',
      lastKnown: previous.lastKnown,
      remaining: CHRONICLES_EXPLORATION_SEARCH_ACTIVATIONS,
    };
  }
  if (previous?.mode === 'search' && previous.remaining > 0) return previous;
  return null;
}

function chasePolicyEnemy(enemy) {
  const movement = enemy?.ai?.engagedMovement || enemy?.ai?.movement || 'cardinal-chase';
  return {
    ...enemy,
    ai: {
      ...(enemy.ai || {}),
      movement,
      engagedMovement: undefined,
      engageRange: undefined,
    },
  };
}

function decisionContext(state, enemy, memory, explorationRound) {
  if (!memory) return { state: { ...state, round: explorationRound }, enemy };
  const decisionState = memory.mode === 'search'
    ? {
        ...state,
        round: explorationRound,
        x: memory.lastKnown.x,
        y: memory.lastKnown.y,
      }
    : { ...state, round: explorationRound };
  return {
    state: decisionState,
    enemy: chasePolicyEnemy(enemy),
  };
}

function memoryAfterActivation(memory) {
  if (!memory) return null;
  if (memory.mode === 'chase') return memory;
  const remaining = memory.remaining - 1;
  return remaining > 0 ? { ...memory, remaining } : null;
}

function withEnemyMemory(state, enemyId, memory) {
  const memories = { ...(state.enemyExplorationAwareness || {}) };
  if (memory) memories[enemyId] = memory;
  else delete memories[enemyId];
  if (!Object.keys(memories).length && !state.enemyExplorationAwareness) return state;
  return { ...state, enemyExplorationAwareness: memories };
}

export function chroniclesAdvanceExplorationEnemies(previous, next) {
  if (!previous || !next) return next;
  if (next.phase !== 'explore' || next.initiative?.order?.length) return next;
  if (previous.mapId !== next.mapId || !partyChangedCell(previous, next)) return next;

  const enemies = chroniclesActiveEnemies(next);
  if (!enemies.length) return next;

  const explorationEnemySteps = explorationEnemyStepCount(previous) + 1;
  let working = { ...next, explorationEnemySteps };

  // Exploration stays fluid rather than becoming a hidden turn system. Enemies
  // get one world activation every few translated party cells; turns in place,
  // UI actions and menu interactions never advance this cadence.
  if (explorationEnemySteps % CHRONICLES_EXPLORATION_ENEMY_STEP_INTERVAL !== 0) {
    return working;
  }

  const explorationRound = Math.floor(
    explorationEnemySteps / CHRONICLES_EXPLORATION_ENEMY_STEP_INTERVAL,
  );

  enemies.forEach((enemy) => {
    const from = chroniclesRuntimeEnemyPosition(working, enemy);
    const memory = awarenessDecision(working, enemy, from);
    const decision = decisionContext(working, enemy, memory, explorationRound);
    const step = chroniclesChooseEnemyStep(decision.state, decision.enemy);

    if (step && (from.x !== step.x || from.y !== step.y)) {
      working = {
        ...working,
        enemyPositions: {
          ...(working.enemyPositions || {}),
          [enemy.id]: { x: step.x, y: step.y },
        },
      };
    }

    working = withEnemyMemory(working, enemy.id, memoryAfterActivation(memory));
  });

  return working;
}

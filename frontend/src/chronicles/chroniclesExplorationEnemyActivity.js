import { chroniclesActiveEnemies } from '../chroniclesOfMatthias.js';
import {
  chroniclesChooseEnemyStep,
  chroniclesRuntimeEnemyPosition,
} from '../chroniclesOfMatthiasTurns.js';

export const CHRONICLES_EXPLORATION_ENEMY_STEP_INTERVAL = 3;

function partyChangedCell(previous, next) {
  return Number(previous?.x) !== Number(next?.x) || Number(previous?.y) !== Number(next?.y);
}

function explorationEnemyStepCount(state) {
  const value = Number(state?.explorationEnemySteps);
  return Number.isInteger(value) && value >= 0 ? value : 0;
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
    const decisionState = { ...working, round: explorationRound };
    const step = chroniclesChooseEnemyStep(decisionState, enemy);
    if (!step) return;

    const from = chroniclesRuntimeEnemyPosition(working, enemy);
    if (from.x === step.x && from.y === step.y) return;

    working = {
      ...working,
      enemyPositions: {
        ...(working.enemyPositions || {}),
        [enemy.id]: { x: step.x, y: step.y },
      },
    };
  });

  return working;
}

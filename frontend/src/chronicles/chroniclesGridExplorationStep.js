import { chroniclesReduce, chroniclesActiveEnemies } from '../chroniclesOfMatthias.js';
import {
  chroniclesChooseEnemyStep,
  chroniclesRuntimeEnemyPosition,
} from '../chroniclesOfMatthiasTurns.js';

// Exploration-only adapter. Combats continue using their Agility + 1d8 initiative owner.
// A reducer transition that does not change the party tile never grants enemy movement.
export function chroniclesGridExplorationStep(state, action) {
  const before = state;
  const next = chroniclesReduce(before, action);
  if (!before || !next || before.phase !== 'explore' || next.phase !== 'explore') return next;
  if (next.x === before.x && next.y === before.y) return next;
  // Reuse the authored occupancy/AI predicates; this scheduler never calls attack or damage APIs.

  let current = next;
  for (const enemy of chroniclesActiveEnemies(next)) {
    const from = chroniclesRuntimeEnemyPosition(current, enemy);
    const to = chroniclesChooseEnemyStep(current, enemy);
    if (!to || (to.x === from.x && to.y === from.y)) continue;
    current = {
      ...current,
      enemyPositions: {
        ...(current.enemyPositions || {}),
        [enemy.id]: { x: to.x, y: to.y },
      },
    };
  }
  return current;
}

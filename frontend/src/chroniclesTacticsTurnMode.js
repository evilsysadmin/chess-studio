import { chroniclesActiveEnemies } from './chroniclesOfMatthias.js';
import { chroniclesTacticsFinishTurn } from './chroniclesOfMatthiasTactics.js';
import { chroniclesRuntimeEnemyPosition } from './chroniclesOfMatthiasTurns.js';

function manhattanDistance(left, right) {
  return Math.abs(left.x - right.x) + Math.abs(left.y - right.y);
}

function enemyEngagementRange(enemy) {
  const attackReach = Math.max(1, Number(enemy?.ai?.attackReach ?? enemy?.retaliationReach ?? 1));
  const configured = Number(enemy?.ai?.engageRange);
  return Number.isFinite(configured) && configured >= 1
    ? Math.max(attackReach, configured)
    : attackReach;
}

export function chroniclesTacticsCombatActive(state) {
  if (!state || state.phase === 'escaped' || state.phase === 'defeated') return false;
  const partyPosition = { x: state.x, y: state.y };
  return chroniclesActiveEnemies(state).some((enemy) => {
    const enemyPosition = chroniclesRuntimeEnemyPosition(state, enemy);
    return manhattanDistance(partyPosition, enemyPosition) <= enemyEngagementRange(enemy);
  });
}

export function chroniclesTacticsResolvePlayerAction(previous, next, { forceCombat = false } = {}) {
  if (!next || next === previous) return previous;
  if (previous?.mapId && next?.mapId && previous.mapId !== next.mapId) return next;
  const shouldResolveEnemyTurn = forceCombat
    || chroniclesTacticsCombatActive(previous)
    || chroniclesTacticsCombatActive(next);
  return shouldResolveEnemyTurn ? chroniclesTacticsFinishTurn(next) : next;
}

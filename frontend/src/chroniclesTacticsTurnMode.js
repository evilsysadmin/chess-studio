import { chroniclesActiveEnemies } from './chroniclesOfMatthias.js';
import {
  chroniclesAdvanceCombatInitiative,
  chroniclesCurrentInitiativeActor,
  chroniclesStartInitiativeCombat,
} from './chronicles/chroniclesInitiative.js';
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
  if (state.initiative?.order?.length) return true;
  const partyPosition = { x: state.x, y: state.y };
  return chroniclesActiveEnemies(state).some((enemy) => {
    const enemyPosition = chroniclesRuntimeEnemyPosition(state, enemy);
    return manhattanDistance(partyPosition, enemyPosition) <= enemyEngagementRange(enemy);
  });
}

export function chroniclesTacticsCurrentActor(state) {
  return chroniclesCurrentInitiativeActor(state?.initiative);
}

export function chroniclesTacticsPartyCanAct(state, memberId = null) {
  if (!state || state.phase === 'escaped' || state.phase === 'defeated') return false;
  const actor = chroniclesTacticsCurrentActor(state);
  if (!actor) return state.turnPhase !== 'enemy';
  if (actor.kind !== 'party') return false;
  return memberId ? actor.id === memberId : true;
}

export function chroniclesTacticsResolvePlayerAction(
  previous,
  next,
  {
    forceCombat = false,
    forceEnemyIds = [],
    partyAgilityBonuses = {},
    random = Math.random,
  } = {},
) {
  if (!previous || !next) return previous || next;
  if (previous?.mapId && next?.mapId && previous.mapId !== next.mapId) return next;
  if (previous.phase === 'escaped' || previous.phase === 'defeated') return previous;

  if (previous.initiative?.order?.length) {
    if (next === previous) return previous;
    return chroniclesAdvanceCombatInitiative(next, chroniclesActiveEnemies(next));
  }

  const alreadyEngaged = chroniclesTacticsCombatActive(previous);
  const shouldStartCombat = forceCombat
    || alreadyEngaged
    || chroniclesTacticsCombatActive(next);
  if (!shouldStartCombat) return next;

  // Entering combat is a boundary, not a free attack. A move that newly enters
  // engagement completes before initiative starts; an already-engaged legacy
  // state or an explicit ranged attack rolls before committing the action.
  const entryState = (forceCombat || alreadyEngaged) ? previous : next;
  const activeEnemies = chroniclesActiveEnemies(entryState);
  const roomEnemyIds = activeEnemies.map((enemy) => enemy.id);
  return chroniclesStartInitiativeCombat(
    entryState,
    activeEnemies,
    {
      // Tactics is a room-scale battle board. Once contact freezes exploration,
      // every living enemy on that board must belong to the same scheduler;
      // otherwise a distant patrol could wander into range without ever owning
      // an initiative turn.
      forceEnemyIds: [...new Set([...roomEnemyIds, ...forceEnemyIds])],
      partyAgilityBonuses,
      random,
    },
  );
}

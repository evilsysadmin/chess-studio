import { chroniclesActiveEnemies } from './chroniclesOfMatthias.js';
import {
  chroniclesMapContentPosition,
  chroniclesMapForState,
} from './chronicles/chroniclesMapCatalog.js';
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

const SAFE_EXPLORATION_SPAWN_DISTANCE = 4;
const RELOCATABLE_SPAWN_MOVEMENTS = new Set(['cardinal-roam', 'cardinal-chase', 'knight-chase']);
const CONTENT_GROUPS = Object.freeze(['triggers', 'interactables', 'treasures', 'traps', 'exits']);

function pointKey(point) {
  return `${point.x}:${point.y}`;
}

function mobileSpawnCanRelocate(enemy) {
  const movement = enemy?.ai?.movement || 'cardinal-chase';
  return RELOCATABLE_SPAWN_MOVEMENTS.has(movement)
    && !enemy?.positionKey
    && !(enemy?.ai?.patrolRoute || []).length;
}

function authoredContentCells(map) {
  return new Set(CONTENT_GROUPS.flatMap((group) => (
    (map?.[group] || []).flatMap((entry) => {
      const position = chroniclesMapContentPosition(map, entry);
      return position ? [pointKey(position)] : [];
    })
  )));
}

function safeSpawnCandidate(state, enemy, occupied) {
  const map = chroniclesMapForState(state);
  const start = { x: Number(state.x), y: Number(state.y) };
  const from = chroniclesRuntimeEnemyPosition(state, enemy);
  const requiredDistance = Math.max(
    SAFE_EXPLORATION_SPAWN_DISTANCE,
    enemyEngagementRange(enemy) + 2,
  );
  const contentCells = authoredContentCells(map);
  const candidates = [];
  map.grid.forEach((row, y) => {
    [...row].forEach((tile, x) => {
      const point = { x, y };
      const key = pointKey(point);
      if (tile === '#' || tile === 'X' || key === pointKey(start)) return;
      if (occupied.has(key) || contentCells.has(key)) return;
      const startDistance = manhattanDistance(start, point);
      if (startDistance < requiredDistance) return;
      candidates.push({
        ...point,
        startDistance,
        relocationDistance: manhattanDistance(from, point),
      });
    });
  });
  return candidates.sort((left, right) => (
    left.relocationDistance - right.relocationDistance
    || right.startDistance - left.startDistance
    || left.y - right.y
    || left.x - right.x
  ))[0] || null;
}

export function chroniclesTacticsPrepareExplorationSpawn(state) {
  if (!state || state.phase !== 'explore' || state.initiative?.order?.length) return state;
  const activeEnemies = chroniclesActiveEnemies(state);
  if (!activeEnemies.length) return state;

  const occupied = new Set(activeEnemies.map((enemy) => pointKey(chroniclesRuntimeEnemyPosition(state, enemy))));
  const enemyPositions = { ...(state.enemyPositions || {}) };
  let changed = false;

  activeEnemies.forEach((enemy) => {
    const current = chroniclesRuntimeEnemyPosition({ ...state, enemyPositions }, enemy);
    const requiredDistance = Math.max(
      SAFE_EXPLORATION_SPAWN_DISTANCE,
      enemyEngagementRange(enemy) + 2,
    );
    if (manhattanDistance({ x: state.x, y: state.y }, current) >= requiredDistance) return;
    if (!mobileSpawnCanRelocate(enemy)) return;

    occupied.delete(pointKey(current));
    const candidate = safeSpawnCandidate({ ...state, enemyPositions }, enemy, occupied);
    if (!candidate) {
      occupied.add(pointKey(current));
      return;
    }
    enemyPositions[enemy.id] = { x: candidate.x, y: candidate.y };
    occupied.add(pointKey(candidate));
    changed = true;
  });

  return changed ? { ...state, enemyPositions } : state;
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
  if (previous?.mapId && next?.mapId && previous.mapId !== next.mapId) {
    return chroniclesTacticsPrepareExplorationSpawn(next);
  }
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

import { chroniclesMapForState } from './chroniclesMapCatalog.js';
import { chroniclesAutomapCellKey, chroniclesAutomapLocalVisibleCells } from './chroniclesAutomap.js';
import { resolveChroniclesEnemyBuildDefinition } from './chroniclesEnemyBuilds.js';
import { chroniclesRuntimeEnemyPosition } from '../chroniclesOfMatthiasTurns.js';
import {
  chroniclesCollapsePartyAfterCombat,
  chroniclesDeployPartyForCombat,
} from '../chroniclesPartyFootprint.js';

export const CHRONICLES_INITIATIVE_VERSION = 1;
export const CHRONICLES_INITIATIVE_DIE_SIDES = 8;

function nonNegativeInteger(value, fallback = 0) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(0, Math.floor(number));
}

export function chroniclesRollD8(random = Math.random) {
  const raw = Number(random());
  const normalized = Number.isFinite(raw) ? Math.min(0.999999999999, Math.max(0, raw)) : 0;
  return 1 + Math.floor(normalized * CHRONICLES_INITIATIVE_DIE_SIDES);
}

// Progression AGI reaches initiative exactly once: through the
// `rpgModifiers` that applyChroniclesProgressionToTacticsState/reconcile
// already keep in the run state. Callers must not add it again.
export function chroniclesPartyInitiativeAgility(state, member) {
  if (!member) return 0;
  const base = nonNegativeInteger(member.agility);
  const progressionBonus = nonNegativeInteger(state?.rpgModifiers?.[member.id]?.initiativeBonus);
  // MM Speed: its bonus (negative for slow heroes) moves the hero in the order.
  const speedBonus = Number(member.mm3?.bonuses?.speed || 0);
  return Math.max(0, base + progressionBonus + speedBonus);
}

export function chroniclesEnemyInitiativeAgility(enemy) {
  if (!enemy) return 0;
  const resolved = resolveChroniclesEnemyBuildDefinition(enemy);
  const buildAgility = nonNegativeInteger(resolved?.build?.attributes?.agility);
  return nonNegativeInteger(enemy.agility == null || enemy.agility === '' ? buildAgility : enemy.agility, buildAgility);
}

function actorEntry({ id, kind, name, agility, random }) {
  const roll = chroniclesRollD8(random);
  return {
    id,
    kind,
    name,
    agility,
    roll,
    initiative: agility + roll,
  };
}

export function chroniclesRollInitiative(
  state,
  enemies,
  { random = Math.random } = {},
) {
  const partyActors = (state?.party || [])
    .filter((member) => Number(member?.hp || 0) > 0)
    .map((member) => actorEntry({
      id: member.id,
      kind: 'party',
      name: member.name || member.id,
      agility: chroniclesPartyInitiativeAgility(state, member),
      random,
    }));

  const enemyActors = (Array.isArray(enemies) ? enemies : [])
    .filter((enemy) => Number(state?.[enemy?.hpKey] || 0) > 0)
    .map((enemy) => actorEntry({
      id: enemy.id,
      kind: 'enemy',
      name: enemy.name || enemy.id,
      agility: chroniclesEnemyInitiativeAgility(enemy),
      random,
    }));

  const order = [...partyActors, ...enemyActors].sort((left, right) => (
    right.initiative - left.initiative
    || right.agility - left.agility
    || right.roll - left.roll
    || left.kind.localeCompare(right.kind)
    || left.id.localeCompare(right.id)
  ));

  return {
    version: CHRONICLES_INITIATIVE_VERSION,
    die: '1d8',
    round: 1,
    cursor: 0,
    order,
  };
}

export function chroniclesCurrentInitiativeActor(initiative) {
  if (!initiative?.order?.length) return null;
  const cursor = Math.max(0, Math.min(initiative.order.length - 1, nonNegativeInteger(initiative.cursor)));
  return initiative.order[cursor] || null;
}

export function chroniclesAdvanceInitiative(initiative) {
  if (!initiative?.order?.length) return initiative;
  const nextCursor = nonNegativeInteger(initiative.cursor) + 1;
  if (nextCursor < initiative.order.length) return { ...initiative, cursor: nextCursor };
  return {
    ...initiative,
    round: nonNegativeInteger(initiative.round, 1) + 1,
    cursor: 0,
  };
}


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

export function chroniclesEngagedEnemies(state, enemies) {
  if (!state || state.phase === 'escaped' || state.phase === 'defeated') return [];
  const partyPosition = { x: state.x, y: state.y };
  const map = chroniclesMapForState(state);
  const visible = map?.grid && Number.isInteger(state.direction)
    ? chroniclesAutomapLocalVisibleCells(map, state, 8)
    : null;
  return (Array.isArray(enemies) ? enemies : []).filter((enemy) => {
    if (Number(state?.[enemy?.hpKey] || 0) <= 0) return false;
    const enemyPosition = chroniclesRuntimeEnemyPosition(state, enemy);
    const distance = manhattanDistance(partyPosition, enemyPosition);
    const reach = enemyEngagementRange(enemy);
    // A nearby enemy is not necessarily an encounter: intervening walls and
    // facing matter. Direct attack range still engages even outside the FOV.
    const attackReach = Math.max(1, Number(enemy?.ai?.attackReach ?? enemy?.retaliationReach ?? 1));
    const visibleToParty = visible?.has(chroniclesAutomapCellKey(enemyPosition.x, enemyPosition.y)) ?? true;
    return distance <= reach && (visibleToParty || distance <= attackReach);
  });
}

function actorIsAlive(state, enemyById, actor) {
  if (actor.kind === 'party') {
    return (state?.party || []).some((member) => member.id === actor.id && Number(member.hp || 0) > 0);
  }
  const enemy = enemyById.get(actor.id);
  return Boolean(enemy && Number(state?.[enemy.hpKey] || 0) > 0);
}

export function chroniclesStartInitiativeCombat(state, enemies, options = {}) {
  if (!state || state.initiative) return state;
  const forceEnemyIds = new Set(Array.isArray(options.forceEnemyIds) ? options.forceEnemyIds : []);
  const candidates = Array.isArray(enemies) ? enemies : [];
  const engagedById = new Map(
    chroniclesEngagedEnemies(state, candidates).map((enemy) => [enemy.id, enemy]),
  );
  candidates.forEach((enemy) => {
    if (forceEnemyIds.has(enemy.id) && Number(state?.[enemy.hpKey] || 0) > 0) {
      engagedById.set(enemy.id, enemy);
    }
  });
  const engaged = [...engagedById.values()];
  if (!engaged.length) return state;
  const deployedState = chroniclesDeployPartyForCombat(state);
  const initiative = chroniclesRollInitiative(deployedState, engaged, options);
  if (!initiative.order.length) return state;
  return {
    ...deployedState,
    phase: 'combat',
    initiative,
    message: `Combate por turnos · iniciativa = AGI + 1d8: ${initiative.order.map((actor) => `${actor.name} ${actor.initiative}`).join(' · ')}.`,
  };
}

export function chroniclesAdvanceCombatInitiative(state, enemies) {
  if (!state?.initiative?.order?.length) return state;
  const enemyById = new Map((Array.isArray(enemies) ? enemies : []).map((enemy) => [enemy.id, enemy]));
  const livingOrder = state.initiative.order.filter((actor) => actorIsAlive(state, enemyById, actor));
  const enemiesRemain = livingOrder.some((actor) => actor.kind === 'enemy');
  // A fight must also end if surviving opponents wander out of sight and
  // cannot reach the group. Do not hold the party hostage in empty corridors.
  const disengaged = state.mapId && Number.isInteger(state.x) && Number.isInteger(state.y)
    && Number.isInteger(state.direction)
    && !chroniclesEngagedEnemies(state, [...enemyById.values()].filter((enemy) => (
      livingOrder.some((actor) => actor.kind === 'enemy' && actor.id === enemy.id)
    ))).length;
  if (!enemiesRemain || disengaged) {
    const collapsed = chroniclesCollapsePartyAfterCombat(state);
    return {
      ...collapsed,
      phase: state.phase === 'defeated' ? 'defeated' : 'explore',
      turnPhase: 'party',
      initiative: null,
    };
  }
  if (!livingOrder.length) return { ...state, initiative: null };

  const originalOrder = state.initiative.order;
  const currentCursor = Math.max(
    0,
    Math.min(originalOrder.length - 1, nonNegativeInteger(state.initiative.cursor)),
  );
  let nextActor = null;
  let wrapped = false;
  for (let offset = 1; offset <= originalOrder.length; offset += 1) {
    const rawIndex = currentCursor + offset;
    const index = rawIndex % originalOrder.length;
    const candidate = originalOrder[index];
    if (!actorIsAlive(state, enemyById, candidate)) continue;
    nextActor = candidate;
    wrapped = rawIndex >= originalOrder.length;
    break;
  }
  if (!nextActor) return { ...state, initiative: null };

  const nextCursor = livingOrder.findIndex((actor) => (
    actor.kind === nextActor.kind && actor.id === nextActor.id
  ));
  return {
    ...state,
    initiative: {
      ...state.initiative,
      order: livingOrder,
      cursor: Math.max(0, nextCursor),
      round: nonNegativeInteger(state.initiative.round, 1) + (wrapped ? 1 : 0),
    },
  };
}

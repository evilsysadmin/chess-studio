import {
  CHRONICLES_DIRECTIONS,
  chroniclesActiveEnemies,
  chroniclesEnemyPosition,
  chroniclesTileAt,
} from './chroniclesOfMatthias.js';
import { chroniclesEquipmentBonuses } from './chronicles/chroniclesEquipment.js';
import {
  chroniclesLivingPartyPositions,
  chroniclesPartyCellOccupied,
} from './chroniclesPartyFootprint.js';

export const CHRONICLES_TURN_ENGINE_VERSION = 'map-ai-v8';

const KNIGHT_STEPS = Object.freeze([
  Object.freeze({ dx: -2, dy: -1 }), Object.freeze({ dx: -2, dy: 1 }),
  Object.freeze({ dx: -1, dy: -2 }), Object.freeze({ dx: -1, dy: 2 }),
  Object.freeze({ dx: 1, dy: -2 }), Object.freeze({ dx: 1, dy: 2 }),
  Object.freeze({ dx: 2, dy: -1 }), Object.freeze({ dx: 2, dy: 1 }),
]);

function distance(a, b) {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}

function sameCell(a, b) {
  return a.x === b.x && a.y === b.y;
}

function walkable(state, position) {
  return chroniclesTileAt(position.x, position.y, state) !== '#';
}

export function chroniclesRuntimeEnemyPosition(state, enemy) {
  const runtime = state?.enemyPositions?.[enemy.id];
  if (runtime && Number.isFinite(runtime.x) && Number.isFinite(runtime.y)) return runtime;
  return chroniclesEnemyPosition(state, enemy);
}

function occupiedByEnemy(state, position, ignoredEnemyId) {
  return chroniclesActiveEnemies(state).some((enemy) => {
    if (enemy.id === ignoredEnemyId) return false;
    return sameCell(chroniclesRuntimeEnemyPosition(state, enemy), position);
  });
}

function canOccupy(state, enemy, position) {
  if (!walkable(state, position)) return false;
  if (chroniclesPartyCellOccupied(state, position)) return false;
  return !occupiedByEnemy(state, position, enemy.id);
}

function lineIsClear(state, from, to) {
  const dx = Math.sign(to.x - from.x);
  const dy = Math.sign(to.y - from.y);
  if (dx && dy) return false;
  let x = from.x + dx;
  let y = from.y + dy;
  while (x !== to.x || y !== to.y) {
    if (chroniclesTileAt(x, y, state) === '#') return false;
    x += dx;
    y += dy;
  }
  return true;
}

function livingPartyTargetsWithPositions(state) {
  const positions = new Map(
    chroniclesLivingPartyPositions(state).map(({ memberId, position }) => [memberId, position]),
  );
  return (state?.party || [])
    .filter((member) => Number(member.hp || 0) > 0 && positions.has(member.id))
    .map((member) => ({ member, position: positions.get(member.id) }));
}

function enemyCanAttackCell(state, enemy, position, partyPosition) {
  const reach = Math.max(1, Number(enemy.ai?.attackReach ?? enemy.retaliationReach ?? 1));
  const separation = distance(position, partyPosition);
  if (separation < 1 || separation > reach) return false;
  if (reach === 1) return separation === 1;
  if (!(position.x === partyPosition.x || position.y === partyPosition.y)) return false;
  return enemy.ai?.requiresLineOfSight === false ? true : lineIsClear(state, position, partyPosition);
}

export function chroniclesEnemyAttackTarget(state, enemy, position = chroniclesRuntimeEnemyPosition(state, enemy)) {
  const livingOrder = (state?.party || []).filter((member) => Number(member.hp || 0) > 0);
  const enemyIndex = Math.max(0, chroniclesActiveEnemies(state).findIndex((candidate) => candidate.id === enemy?.id));
  const rotation = livingOrder.length
    ? (Math.max(0, Number(state?.round || 0)) + enemyIndex) % livingOrder.length
    : 0;
  const turnRank = (member) => {
    const index = Math.max(0, livingOrder.findIndex((candidate) => candidate.id === member.id));
    return livingOrder.length ? (index - rotation + livingOrder.length) % livingOrder.length : index;
  };

  return livingPartyTargetsWithPositions(state)
    .filter((target) => enemyCanAttackCell(state, enemy, position, target.position))
    .sort((left, right) => (
      distance(position, left.position) - distance(position, right.position)
      || (left.member.row === 'front' ? 0 : 1) - (right.member.row === 'front' ? 0 : 1)
      || turnRank(left.member) - turnRank(right.member)
      || left.member.id.localeCompare(right.member.id)
    ))[0]?.member || null;
}

export function chroniclesEnemyCanAttackParty(state, enemy, position = chroniclesRuntimeEnemyPosition(state, enemy)) {
  return Boolean(chroniclesEnemyAttackTarget(state, enemy, position));
}

function partyTargetPositions(state) {
  return livingPartyTargetsWithPositions(state).map(({ position }) => position);
}

function candidateScore(position, targets, index) {
  const nearest = targets.length
    ? Math.min(...targets.map((target) => distance(position, target)))
    : 999;
  return nearest * 100 + index;
}

function positionKey(position) {
  return `${position.x}:${position.y}`;
}

function canAttackAnyPartyFrom(state, enemy, position) {
  return livingPartyTargetsWithPositions(state)
    .some(({ position: partyPosition }) => enemyCanAttackCell(state, enemy, position, partyPosition));
}

function chooseGreedyCardinalStep(state, enemy, from) {
  const targets = partyTargetPositions(state);
  return CHRONICLES_DIRECTIONS
    .map((step, index) => ({ x: from.x + step.dx, y: from.y + step.dy, index }))
    .filter((position) => canOccupy(state, enemy, position))
    .sort((left, right) => candidateScore(left, targets, left.index) - candidateScore(right, targets, right.index))[0] || null;
}

function chooseCardinalStep(state, enemy, from) {
  const queue = [{ position: from, firstStep: null }];
  const visited = new Set([positionKey(from)]);

  while (queue.length) {
    const current = queue.shift();
    if (current.firstStep && canAttackAnyPartyFrom(state, enemy, current.position)) {
      return current.firstStep;
    }

    for (const step of CHRONICLES_DIRECTIONS) {
      const position = {
        x: current.position.x + step.dx,
        y: current.position.y + step.dy,
      };
      const key = positionKey(position);
      if (visited.has(key) || !canOccupy(state, enemy, position)) continue;
      visited.add(key);
      queue.push({
        position,
        firstStep: current.firstStep || position,
      });
    }
  }

  // Authored/generated maps are expected to remain connected, but legacy or
  // temporarily blocked rooms may not offer a route to an attack cell. Keep
  // the old deterministic local move as a bounded fallback instead of jittering
  // or teleporting through geometry.
  return chooseGreedyCardinalStep(state, enemy, from);
}

function chooseKnightStep(state, enemy, from) {
  const targets = partyTargetPositions(state);
  return KNIGHT_STEPS
    .map((step, index) => ({ x: from.x + step.dx, y: from.y + step.dy, index }))
    .filter((position) => canOccupy(state, enemy, position))
    .sort((left, right) => candidateScore(left, targets, left.index) - candidateScore(right, targets, right.index))[0] || null;
}

function choosePatrolRouteStep(state, enemy, from) {
  const route = enemy.ai?.patrolRoute || [];
  if (route.length < 2) return null;
  const currentIndex = route.findIndex((point) => sameCell(point, from));
  if (currentIndex < 0) return null;
  const next = route[(currentIndex + 1) % route.length];
  return canOccupy(state, enemy, next) ? { x: next.x, y: next.y } : null;
}

function roamingDirectionOffset(state, enemy) {
  const salt = [...String(enemy.id || '')].reduce((total, char) => total + char.charCodeAt(0), 0);
  return (Math.max(0, Number(state.round || 0)) + salt) % CHRONICLES_DIRECTIONS.length;
}

function chooseRoamingCardinalStep(state, enemy, from) {
  const offset = roamingDirectionOffset(state, enemy);
  for (let index = 0; index < CHRONICLES_DIRECTIONS.length; index += 1) {
    const step = CHRONICLES_DIRECTIONS[(offset + index) % CHRONICLES_DIRECTIONS.length];
    const position = { x: from.x + step.dx, y: from.y + step.dy };
    if (canOccupy(state, enemy, position)) return position;
  }
  return null;
}

function nearestPartyDistance(state, position) {
  const targets = partyTargetPositions(state);
  return targets.length
    ? Math.min(...targets.map((target) => distance(position, target)))
    : Infinity;
}

function chooseRetreatCardinalStep(state, enemy, from) {
  const currentDistance = nearestPartyDistance(state, from);
  return CHRONICLES_DIRECTIONS
    .map((step, index) => ({ x: from.x + step.dx, y: from.y + step.dy, index }))
    .filter((position) => canOccupy(state, enemy, position))
    .filter((position) => nearestPartyDistance(state, position) > currentDistance)
    .sort((left, right) => (
      nearestPartyDistance(state, right) - nearestPartyDistance(state, left)
      || left.index - right.index
    ))[0] || null;
}

export function chroniclesChooseEnemyDisengageStep(state, enemy) {
  const disengageRange = Number(enemy?.ai?.disengageRange);
  if (!Number.isFinite(disengageRange) || disengageRange < 1) return null;
  const from = chroniclesRuntimeEnemyPosition(state, enemy);
  if (nearestPartyDistance(state, from) > disengageRange) return null;
  return chooseRetreatCardinalStep(state, enemy, from);
}

function enemyMovementForDistance(state, enemy, from) {
  const movement = enemy.ai?.movement || 'cardinal-chase';
  const engagedMovement = enemy.ai?.engagedMovement;
  const engageRange = Number(enemy.ai?.engageRange);
  if (!engagedMovement || !Number.isFinite(engageRange) || engageRange < 1) return movement;
  const targets = partyTargetPositions(state);
  const nearestDistance = targets.length
    ? Math.min(...targets.map((target) => distance(from, target)))
    : Infinity;
  return nearestDistance <= engageRange ? engagedMovement : movement;
}

export function chroniclesChooseEnemyStep(state, enemy) {
  const from = chroniclesRuntimeEnemyPosition(state, enemy);
  const movement = enemyMovementForDistance(state, enemy, from);
  if (movement === 'hold') return null;
  if (movement === 'knight-chase') return chooseKnightStep(state, enemy, from);
  if (movement === 'patrol-route') return choosePatrolRouteStep(state, enemy, from);
  if (movement === 'cardinal-roam') return chooseRoamingCardinalStep(state, enemy, from);
  return chooseCardinalStep(state, enemy, from);
}

function choosePartyTarget(state, enemy, position) {
  return chroniclesEnemyAttackTarget(state, enemy, position);
}

function appendDownJournal(state, member) {
  const journal = Array.isArray(state.journal) ? state.journal : [];
  const id = `down-${member.id}`;
  if (journal.some((entry) => entry.id === id)) return state;
  return {
    ...state,
    journal: [...journal, {
      id,
      title: `${member.name} cae`,
      body: `${member.name} queda fuera de combate durante el turno de las criaturas. Matthias reserva un margen para comentarios de dudosa utilidad médica.`,
      sigil: '†',
    }],
  };
}

function damageParty(state, enemy, enemyIndex, events, target = null) {
  const enemyPosition = chroniclesRuntimeEnemyPosition(state, enemy);
  target = target || choosePartyTarget(state, enemy, enemyPosition);
  if (!target) return state;
  const rawDamage = Math.max(1, Number(enemy.retaliation || 1));
  const damage = Math.max(0, rawDamage - chroniclesEquipmentBonuses(state, target.id).damageReduction);
  const previousHp = target.hp;
  const nextHp = Math.max(0, previousHp - damage);
  let next = {
    ...state,
    party: state.party.map((member) => member.id === target.id ? { ...member, hp: nextHp } : member),
  };
  events.push({
    type: 'attack',
    enemyId: enemy.id,
    targetId: target.id,
    damage,
    fromHp: previousHp,
    toHp: nextHp,
  });
  if (previousHp > 0 && nextHp === 0) next = appendDownJournal(next, target);
  return next;
}

function moveEnemy(state, enemy, to, events) {
  if (!to) return state;
  const from = chroniclesRuntimeEnemyPosition(state, enemy);
  const enemyPositions = {
    ...(state.enemyPositions || {}),
    [enemy.id]: { x: to.x, y: to.y },
  };
  events.push({ type: 'move', enemyId: enemy.id, from: { x: from.x, y: from.y }, to: { x: to.x, y: to.y } });
  return { ...state, enemyPositions };
}

function partyDefeated(state) {
  return state.party.every((member) => member.hp <= 0);
}

function turnSummary(state, events) {
  const attacks = events.filter((event) => event.type === 'attack');
  if (partyDefeated(state)) return 'La compañía cae. La cripta, con notable falta de deportividad, permanece en pie.';
  if (attacks.length) return `Turno de las criaturas: ${attacks.length === 1 ? 'un impacto encuentra carne, piedra o dignidad' : `${attacks.length} impactos sacuden la formación`}.`;
  if (events.some((event) => event.type === 'move')) return 'Turno de las criaturas: piedra contra piedra; algo cambia de casilla en la oscuridad.';
  return state.message;
}

export function chroniclesResolveEnemyActor(state, enemyId) {
  if (!state || state.phase === 'escaped' || state.phase === 'defeated') return state;
  const activeEnemies = chroniclesActiveEnemies(state);
  const enemyIndex = activeEnemies.findIndex((enemy) => enemy.id === enemyId);
  if (enemyIndex < 0) return state;
  const enemy = activeEnemies[enemyIndex];
  const events = [];
  let next = { ...state, turnPhase: 'enemy', enemyTurnEvents: events };
  const position = chroniclesRuntimeEnemyPosition(next, enemy);
  const disengageStep = chroniclesChooseEnemyDisengageStep(next, enemy);
  const target = chroniclesEnemyAttackTarget(next, enemy, position);
  if (disengageStep) {
    next = moveEnemy(next, enemy, disengageStep, events);
  } else if (target) {
    next = damageParty(next, enemy, enemyIndex, events, target);
  } else {
    next = moveEnemy(next, enemy, chroniclesChooseEnemyStep(next, enemy), events);
    const movedPosition = chroniclesRuntimeEnemyPosition(next, enemy);
    const movedTarget = chroniclesEnemyAttackTarget(next, enemy, movedPosition);
    if (movedTarget) next = damageParty(next, enemy, enemyIndex, events, movedTarget);
  }
  const defeated = partyDefeated(next);
  return {
    ...next,
    phase: defeated ? 'defeated' : next.phase,
    turnPhase: defeated ? 'party' : next.turnPhase,
    enemyTurnEvents: [...events],
    message: turnSummary(next, events),
  };
}

export function chroniclesResolveEnemyTurn(state) {
  if (!state || state.phase === 'escaped' || state.phase === 'defeated') return state;
  const activeEnemies = chroniclesActiveEnemies(state);
  if (!activeEnemies.length) {
    return {
      ...state,
      turnPhase: 'party',
      enemyTurnEvents: [],
      round: Number(state.round || 0) + 1,
    };
  }

  const events = [];
  let next = {
    ...state,
    turnPhase: 'enemy',
    enemyTurnEvents: events,
  };

  activeEnemies.forEach((enemy, enemyIndex) => {
    if (partyDefeated(next)) return;
    const position = chroniclesRuntimeEnemyPosition(next, enemy);
    const disengageStep = chroniclesChooseEnemyDisengageStep(next, enemy);
    const target = chroniclesEnemyAttackTarget(next, enemy, position);
    if (disengageStep) {
      next = moveEnemy(next, enemy, disengageStep, events);
      return;
    }
    if (target) {
      next = damageParty(next, enemy, enemyIndex, events, target);
      return;
    }
    next = moveEnemy(next, enemy, chroniclesChooseEnemyStep(next, enemy), events);
    const movedPosition = chroniclesRuntimeEnemyPosition(next, enemy);
    const movedTarget = chroniclesEnemyAttackTarget(next, enemy, movedPosition);
    if (movedTarget) next = damageParty(next, enemy, enemyIndex, events, movedTarget);
  });

  const defeated = partyDefeated(next);
  return {
    ...next,
    phase: defeated ? 'defeated' : next.phase,
    turnPhase: 'party',
    round: Number(state.round || 0) + 1,
    enemyTurnEvents: [...events],
    message: turnSummary(next, events),
  };
}

// Cells the party could stand on right now and be attacked by `enemy` without
// the enemy moving first. Reuses the real attack predicate so overlays cannot
// disagree with the turn engine.
export function chroniclesEnemyThreatCells(
  state,
  enemy,
  position = chroniclesRuntimeEnemyPosition(state, enemy),
) {
  const reach = Math.max(1, Number(enemy.ai?.attackReach ?? enemy.retaliationReach ?? 1));
  const cells = [];
  for (let dy = -reach; dy <= reach; dy += 1) {
    for (let dx = -reach; dx <= reach; dx += 1) {
      const separation = Math.abs(dx) + Math.abs(dy);
      if (separation < 1 || separation > reach) continue;
      const cell = { x: position.x + dx, y: position.y + dy };
      const tile = chroniclesTileAt(cell.x, cell.y, state);
      if (tile === '#' || tile === 'X') continue;
      if (enemyCanAttackCell(state, enemy, position, cell)) cells.push(cell);
    }
  }
  return cells;
}

// Exact enemy response preview. The resolver is pure and deterministic, so the
// preview deliberately delegates to the real turn pipeline rather than
// reimplementing movement, targeting, damage or line-of-sight rules.
export function chroniclesPreviewEnemyTurn(state) {
  const empty = Object.freeze({
    round: Number(state?.round || 0),
    intents: Object.freeze([]),
    attackedMemberIds: Object.freeze([]),
    partyWouldFall: false,
  });
  if (!state || state.phase === 'escaped' || state.phase === 'defeated') return empty;
  const activeEnemies = chroniclesActiveEnemies(state);
  if (!activeEnemies.length) return empty;

  const resolved = chroniclesResolveEnemyTurn(state);
  const eventsByEnemy = new Map();
  (resolved.enemyTurnEvents || []).forEach((event) => {
    const events = eventsByEnemy.get(event.enemyId) || [];
    events.push(event);
    eventsByEnemy.set(event.enemyId, events);
  });
  const intents = activeEnemies.map((enemy) => {
    const position = chroniclesRuntimeEnemyPosition(state, enemy);
    const from = { x: position.x, y: position.y };
    const events = eventsByEnemy.get(enemy.id) || [];
    if (!events.length) return { enemyId: enemy.id, kind: 'hold', from };

    const move = events.find((event) => event.type === 'move') || null;
    const attack = events.find((event) => event.type === 'attack') || null;
    if (attack) {
      return {
        enemyId: enemy.id,
        kind: move ? 'move-attack' : 'attack',
        from,
        ...(move ? { to: { x: move.to.x, y: move.to.y } } : {}),
        targetId: attack.targetId,
        damage: attack.damage,
        hpLost: attack.fromHp - attack.toHp,
        lethal: attack.toHp === 0,
      };
    }

    return {
      enemyId: enemy.id,
      kind: 'move',
      from,
      to: { x: move.to.x, y: move.to.y },
    };
  });
  const attackedMemberIds = [
    ...new Set(
      intents
        .filter((intent) => intent.kind === 'attack' || intent.kind === 'move-attack')
        .map((intent) => intent.targetId),
    ),
  ];
  return {
    round: Number(state.round || 0),
    intents,
    attackedMemberIds,
    partyWouldFall: resolved.phase === 'defeated',
  };
}

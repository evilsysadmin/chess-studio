import {
  CHRONICLES_DIRECTIONS,
  chroniclesActiveEnemies,
  chroniclesEnemyPosition,
  chroniclesTileAt,
} from './chroniclesOfMatthias.js';

export const CHRONICLES_TURN_ENGINE_VERSION = 'map-ai-v6';

const AWARENESS_MEMORY_TURNS = 2;
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
  if (sameCell(position, state)) return false;
  return !occupiedByEnemy(state, position, enemy.id);
}

function canTraverseTowards(state, enemy, position, target) {
  if (!walkable(state, position)) return false;
  if (occupiedByEnemy(state, position, enemy.id)) return false;
  if (sameCell(position, state)) return sameCell(position, target);
  return true;
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

export function chroniclesEnemyCanAttackParty(state, enemy, position = chroniclesRuntimeEnemyPosition(state, enemy)) {
  const reach = Math.max(1, Number(enemy.ai?.attackReach ?? enemy.retaliationReach ?? 1));
  const partyPosition = { x: state.x, y: state.y };
  const separation = distance(position, partyPosition);
  if (separation < 1 || separation > reach) return false;
  if (reach === 1) return separation === 1;
  if (!(position.x === partyPosition.x || position.y === partyPosition.y)) return false;
  return enemy.ai?.requiresLineOfSight === false ? true : lineIsClear(state, position, partyPosition);
}

function enemyDetectsParty(state, enemy, from) {
  const engageRange = Number(enemy.ai?.engageRange);
  if (!enemy.ai?.engagedMovement || !Number.isFinite(engageRange) || engageRange < 1) return false;
  const partyPosition = { x: state.x, y: state.y };
  if (distance(from, partyPosition) > engageRange) return false;
  if (!enemy.ai?.requiresLineOfSight) return true;
  if (!(from.x === partyPosition.x || from.y === partyPosition.y)) return false;
  return lineIsClear(state, from, partyPosition);
}

function awarenessFor(state, enemy) {
  const awareness = state?.enemyAwareness?.[enemy.id];
  if (!awareness || Number(awareness.turns || 0) <= 0) return null;
  if (!Number.isFinite(awareness.lastKnown?.x) || !Number.isFinite(awareness.lastKnown?.y)) return null;
  return awareness;
}

function refreshEnemyAwareness(state, enemy, from) {
  if (!enemy.ai?.engagedMovement) return state;
  const current = awarenessFor(state, enemy);
  let nextAwareness = current;

  if (enemyDetectsParty(state, enemy, from)) {
    nextAwareness = {
      turns: AWARENESS_MEMORY_TURNS,
      lastKnown: { x: state.x, y: state.y },
    };
  } else if (current) {
    const turns = current.turns - 1;
    nextAwareness = turns > 0 ? { ...current, turns } : null;
  }

  if (!current && !nextAwareness) return state;
  const enemyAwareness = { ...(state.enemyAwareness || {}) };
  if (nextAwareness) enemyAwareness[enemy.id] = nextAwareness;
  else delete enemyAwareness[enemy.id];
  return { ...state, enemyAwareness };
}

function candidateScore(position, target, index) {
  return distance(position, target) * 100 + index;
}

function chooseGreedyCardinalStep(state, enemy, from, target) {
  return CHRONICLES_DIRECTIONS
    .map((step, index) => ({ x: from.x + step.dx, y: from.y + step.dy, index }))
    .filter((position) => canOccupy(state, enemy, position))
    .sort((left, right) => candidateScore(left, target, left.index) - candidateScore(right, target, right.index))[0] || null;
}

function chooseCardinalStep(state, enemy, from, target = { x: state.x, y: state.y }) {
  const startKey = `${from.x},${from.y}`;
  const visited = new Set([startKey]);
  const queue = [{ position: { x: from.x, y: from.y }, firstStep: null }];

  while (queue.length) {
    const current = queue.shift();
    for (let index = 0; index < CHRONICLES_DIRECTIONS.length; index += 1) {
      const step = CHRONICLES_DIRECTIONS[index];
      const next = { x: current.position.x + step.dx, y: current.position.y + step.dy };
      const key = `${next.x},${next.y}`;
      if (visited.has(key) || !canTraverseTowards(state, enemy, next, target)) continue;
      const firstStep = current.firstStep || next;
      if (sameCell(next, target)) return firstStep;
      visited.add(key);
      queue.push({ position: next, firstStep });
    }
  }

  return chooseGreedyCardinalStep(state, enemy, from, target);
}

function chooseKnightStep(state, enemy, from, target = { x: state.x, y: state.y }) {
  return KNIGHT_STEPS
    .map((step, index) => ({ x: from.x + step.dx, y: from.y + step.dy, index }))
    .filter((position) => canOccupy(state, enemy, position))
    .sort((left, right) => candidateScore(left, target, left.index) - candidateScore(right, target, right.index))[0] || null;
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

function enemyMovementIntent(state, enemy, from) {
  const baseMovement = enemy.ai?.movement || 'cardinal-chase';
  const engagedMovement = enemy.ai?.engagedMovement;
  if (!engagedMovement) return { movement: baseMovement, target: { x: state.x, y: state.y } };

  const detected = enemyDetectsParty(state, enemy, from);
  const awareness = awarenessFor(state, enemy);
  if (!detected && !awareness) return { movement: baseMovement, target: { x: state.x, y: state.y } };

  return {
    movement: engagedMovement,
    target: detected ? { x: state.x, y: state.y } : awareness.lastKnown,
  };
}

export function chroniclesChooseEnemyStep(state, enemy) {
  const from = chroniclesRuntimeEnemyPosition(state, enemy);
  const { movement, target } = enemyMovementIntent(state, enemy, from);
  if (movement === 'hold') return null;
  if (movement === 'knight-chase') return chooseKnightStep(state, enemy, from, target);
  if (movement === 'patrol-route') return choosePatrolRouteStep(state, enemy, from);
  if (movement === 'cardinal-roam') return chooseRoamingCardinalStep(state, enemy, from);
  return chooseCardinalStep(state, enemy, from, target);
}

function livingPartyTargets(state) {
  const living = state.party.filter((member) => member.hp > 0);
  const front = living.filter((member) => member.row === 'front');
  return front.length ? front : living;
}

function choosePartyTarget(state, enemyIndex) {
  const candidates = livingPartyTargets(state);
  if (!candidates.length) return null;
  const round = Number(state.round || 0);
  return candidates[(round + enemyIndex) % candidates.length];
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

function damageParty(state, enemy, enemyIndex, events) {
  const target = choosePartyTarget(state, enemyIndex);
  if (!target) return state;
  const damage = Math.max(1, Number(enemy.retaliation || 1));
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
    next = refreshEnemyAwareness(next, enemy, position);
    if (chroniclesEnemyCanAttackParty(next, enemy, position)) {
      next = damageParty(next, enemy, enemyIndex, events);
      return;
    }
    next = moveEnemy(next, enemy, chroniclesChooseEnemyStep(next, enemy), events);
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

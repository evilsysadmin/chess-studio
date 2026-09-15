import {
  CHRONICLES_DIRECTIONS,
  CHRONICLES_ENEMIES,
  chroniclesActiveEnemies,
  chroniclesEnemyPosition,
  chroniclesTileAt,
} from './chroniclesOfMatthias.js';

export const CHRONICLES_TURN_ENGINE_VERSION = 'alternating-v1';

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

function walkable(position) {
  return chroniclesTileAt(position.x, position.y) !== '#';
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
  if (!walkable(position)) return false;
  if (sameCell(position, state)) return false;
  return !occupiedByEnemy(state, position, enemy.id);
}

function lineIsClear(from, to) {
  const dx = Math.sign(to.x - from.x);
  const dy = Math.sign(to.y - from.y);
  if (dx && dy) return false;
  let x = from.x + dx;
  let y = from.y + dy;
  while (x !== to.x || y !== to.y) {
    if (chroniclesTileAt(x, y) === '#') return false;
    x += dx;
    y += dy;
  }
  return true;
}

export function chroniclesEnemyCanAttackParty(state, enemy, position = chroniclesRuntimeEnemyPosition(state, enemy)) {
  const reach = Math.max(1, Number(enemy.retaliationReach ?? 1));
  const partyPosition = { x: state.x, y: state.y };
  const separation = distance(position, partyPosition);
  if (separation < 1 || separation > reach) return false;
  if (reach === 1) return separation === 1;
  return (position.x === partyPosition.x || position.y === partyPosition.y) && lineIsClear(position, partyPosition);
}

function candidateScore(position, partyPosition, index) {
  return distance(position, partyPosition) * 100 + index;
}

function chooseCardinalStep(state, enemy, from) {
  const partyPosition = { x: state.x, y: state.y };
  return CHRONICLES_DIRECTIONS
    .map((step, index) => ({ x: from.x + step.dx, y: from.y + step.dy, index }))
    .filter((position) => canOccupy(state, enemy, position))
    .sort((left, right) => candidateScore(left, partyPosition, left.index) - candidateScore(right, partyPosition, right.index))[0] || null;
}

function chooseKnightStep(state, enemy, from) {
  const partyPosition = { x: state.x, y: state.y };
  return KNIGHT_STEPS
    .map((step, index) => ({ x: from.x + step.dx, y: from.y + step.dy, index }))
    .filter((position) => canOccupy(state, enemy, position))
    .sort((left, right) => candidateScore(left, partyPosition, left.index) - candidateScore(right, partyPosition, right.index))[0] || null;
}

export function chroniclesChooseEnemyStep(state, enemy) {
  const from = chroniclesRuntimeEnemyPosition(state, enemy);
  if (enemy.id === 'scavenger-knight') return chooseKnightStep(state, enemy, from);
  return chooseCardinalStep(state, enemy, from);
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

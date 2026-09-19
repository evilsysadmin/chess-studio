import {
  CHRONICLES_DIRECTIONS,
  chroniclesActiveEnemies,
  chroniclesEnemyPosition,
  chroniclesTileAt,
} from './chroniclesOfMatthias.js';

export const CHRONICLES_TURN_ENGINE_VERSION = 'map-ai-v5';

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

function enemyMovementForDistance(state, enemy, from) {
  const movement = enemy.ai?.movement || 'cardinal-chase';
  const engagedMovement = enemy.ai?.engagedMovement;
  const engageRange = Number(enemy.ai?.engageRange);
  if (!engagedMovement || !Number.isFinite(engageRange) || engageRange < 1) return movement;
  const partyPosition = { x: state.x, y: state.y };
  return distance(from, partyPosition) <= engageRange ? engagedMovement : movement;
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

// Cells the party could stand on right now and be attacked by `enemy` without
// the enemy moving first. Reuses the real attack predicate (reach, cardinal
// lines, line of sight) so the overlay cannot disagree with the turn engine.
export function chroniclesEnemyThreatCells(state, enemy, position = chroniclesRuntimeEnemyPosition(state, enemy)) {
  const reach = Math.max(1, Number(enemy.ai?.attackReach ?? enemy.retaliationReach ?? 1));
  const cells = [];
  for (let dy = -reach; dy <= reach; dy += 1) {
    for (let dx = -reach; dx <= reach; dx += 1) {
      const separation = Math.abs(dx) + Math.abs(dy);
      if (separation < 1 || separation > reach) continue;
      const cell = { x: position.x + dx, y: position.y + dy };
      const tile = chroniclesTileAt(cell.x, cell.y, state);
      if (tile === '#' || tile === 'X') continue;
      if (chroniclesEnemyCanAttackParty({ ...state, x: cell.x, y: cell.y }, enemy, position)) cells.push(cell);
    }
  }
  return cells;
}

// What every active creature will do in response to the state exactly as given
// (e.g. the state right after a candidate party action). The preview is the real
// resolver run on a copy of the state (it is pure and has no randomness), so the
// telegraphed intent is exact by construction. Callers decide whether the
// resolver would actually run for a given action (see chroniclesTacticsResolvePlayerAction).
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
  const eventByEnemy = new Map((resolved.enemyTurnEvents || []).map((event) => [event.enemyId, event]));
  const intents = activeEnemies.map((enemy) => {
    const position = chroniclesRuntimeEnemyPosition(state, enemy);
    const from = { x: position.x, y: position.y };
    const event = eventByEnemy.get(enemy.id);
    if (!event) return { enemyId: enemy.id, kind: 'hold', from };
    if (event.type === 'attack') {
      return {
        enemyId: enemy.id,
        kind: 'attack',
        from,
        targetId: event.targetId,
        damage: event.damage,
        hpLost: event.fromHp - event.toHp,
        lethal: event.toHp === 0,
      };
    }
    return { enemyId: enemy.id, kind: 'move', from, to: { x: event.to.x, y: event.to.y } };
  });
  const attackedMemberIds = [...new Set(intents.filter((intent) => intent.kind === 'attack').map((intent) => intent.targetId))];
  return {
    round: Number(state.round || 0),
    intents,
    attackedMemberIds,
    partyWouldFall: resolved.phase === 'defeated',
  };
}

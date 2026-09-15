import {
  CHRONICLES_DIRECTIONS,
  chroniclesActiveEnemies,
  chroniclesTileAt,
} from './chroniclesOfMatthias.js';
import {
  chroniclesResolveEnemyTurn,
  chroniclesRuntimeEnemyPosition,
} from './chroniclesOfMatthiasTurns.js';

const MOVE_LABELS = Object.freeze({
  north: 'Norte',
  east: 'Este',
  south: 'Sur',
  west: 'Oeste',
});

const MOVE_GLYPHS = Object.freeze({
  north: '↑',
  east: '→',
  south: '↓',
  west: '←',
});

function sameCell(left, right) {
  return left.x === right.x && left.y === right.y;
}

function activeEnemiesWithPositions(state) {
  return chroniclesActiveEnemies(state).map((enemy) => ({
    enemy,
    position: chroniclesRuntimeEnemyPosition(state, enemy),
  }));
}

function canUseExit(state) {
  return Boolean(state.sigilAwake && state.jailerHp <= 0 && state.blackGateKey);
}

function occupiedByEnemy(state, position) {
  return activeEnemiesWithPositions(state).some(({ position: enemyPosition }) => sameCell(position, enemyPosition));
}

function lineIsClear(state, from, to, ignoredEnemyId = null) {
  const dx = Math.sign(to.x - from.x);
  const dy = Math.sign(to.y - from.y);
  if (dx && dy) return false;

  let x = from.x + dx;
  let y = from.y + dy;
  while (x !== to.x || y !== to.y) {
    if (chroniclesTileAt(x, y) === '#') return false;
    const blocked = activeEnemiesWithPositions(state).some(({ enemy, position }) => (
      enemy.id !== ignoredEnemyId && position.x === x && position.y === y
    ));
    if (blocked) return false;
    x += dx;
    y += dy;
  }
  return true;
}

function memberFor(state, memberId) {
  return state.party.find((member) => member.id === memberId) || null;
}

function targetDistance(state, position) {
  return Math.abs(position.x - state.x) + Math.abs(position.y - state.y);
}

function appendJournal(state, entry) {
  const journal = Array.isArray(state.journal) ? state.journal : [];
  if (journal.some((item) => item.id === entry.id)) return state;
  return { ...state, journal: [...journal, entry] };
}

function rewardEnemyDefeat(state, enemy, attacker) {
  let next = state;
  if (enemy.id === 'spectral-bishop') {
    next = {
      ...next,
      spectralLantern: true,
      party: next.party.map((member) => member.hp > 0
        ? { ...member, hp: Math.min(member.maxHp, member.hp + 1) }
        : member),
    };
  }
  if (enemy.id === 'scavenger-knight') next = { ...next, blackGateKey: true };

  return appendJournal(next, {
    id: `tactics-${enemy.id}-falls`,
    title: `${enemy.name} cae`,
    body: `${attacker.name} firma la baja durante la incursión táctica. La cripta registra la protesta y sigue operativa.`,
    sigil: '†',
  });
}

function actionAllowed(state) {
  return Boolean(state && state.turnPhase !== 'enemy' && state.phase !== 'defeated' && state.phase !== 'escaped');
}

export function chroniclesTacticsLegalMoves(state) {
  if (!actionAllowed(state)) return [];
  return CHRONICLES_DIRECTIONS.flatMap((direction) => {
    const position = { x: state.x + direction.dx, y: state.y + direction.dy };
    const tile = chroniclesTileAt(position.x, position.y);
    if (tile === '#') return [];
    if (occupiedByEnemy(state, position)) return [];
    if (tile === 'X' && !canUseExit(state)) return [];
    return [{
      key: direction.key,
      label: MOVE_LABELS[direction.key] || direction.label,
      glyph: MOVE_GLYPHS[direction.key] || direction.label,
      x: position.x,
      y: position.y,
      tile,
    }];
  });
}

export function chroniclesTacticsTargets(state, memberId) {
  if (!actionAllowed(state)) return [];
  const member = memberFor(state, memberId);
  if (!member || member.hp <= 0) return [];
  const reach = Math.max(1, Number(member.reach || 1));

  return activeEnemiesWithPositions(state)
    .flatMap(({ enemy, position }) => {
      const distance = targetDistance(state, position);
      const aligned = position.x === state.x || position.y === state.y;
      if (!aligned || distance < 1 || distance > reach) return [];
      if (!lineIsClear(state, { x: state.x, y: state.y }, position, enemy.id)) return [];
      return [{
        enemyId: enemy.id,
        name: enemy.name,
        hp: Math.max(0, Number(state[enemy.hpKey] || 0)),
        maxHp: enemy.maxHp,
        distance,
        x: position.x,
        y: position.y,
      }];
    })
    .sort((left, right) => left.distance - right.distance || left.enemyId.localeCompare(right.enemyId));
}

export function chroniclesTacticsMove(state, destination) {
  const legal = chroniclesTacticsLegalMoves(state).find((move) => move.x === destination?.x && move.y === destination?.y);
  if (!legal) return state;

  const turns = Number(state.turns || 0) + 1;
  if (legal.tile === 'S' && !state.sigilAwake) {
    return appendJournal({
      ...state,
      x: legal.x,
      y: legal.y,
      sigilAwake: true,
      turns,
      message: 'La compañía pisa el sello. La piedra despierta y más piezas hostiles entran en la partida.',
    }, {
      id: 'tactics-sigil-awake',
      title: 'El sello despierta',
      body: 'La formación activa el sello de la cripta. Torre y alfil reciben la noticia con una hostilidad muy profesional.',
      sigil: 'III',
    });
  }

  if (legal.tile === 'X') {
    return appendJournal({
      ...state,
      x: legal.x,
      y: legal.y,
      phase: 'escaped',
      turns,
      message: 'La compañía cruza la puerta negra. Sobrevivir sigue siendo una métrica de rendimiento perfectamente válida.',
    }, {
      id: 'tactics-escape',
      title: 'Extracción completada',
      body: 'La compañía abandona la cripta táctica con más miembros que cadáveres. Matthias lo registra como excelencia.',
      sigil: 'VII',
    });
  }

  return {
    ...state,
    x: legal.x,
    y: legal.y,
    turns,
    message: `La compañía avanza hacia ${legal.label.toLowerCase()}. Piedra, formación y malas intenciones.`,
  };
}

export function chroniclesTacticsAttack(state, memberId, enemyId) {
  const target = chroniclesTacticsTargets(state, memberId).find((candidate) => candidate.enemyId === enemyId);
  const attacker = memberFor(state, memberId);
  if (!target || !attacker) return state;
  const enemy = chroniclesActiveEnemies(state).find((candidate) => candidate.id === enemyId);
  if (!enemy) return state;

  const nextHp = Math.max(0, Number(state[enemy.hpKey] || 0) - Math.max(1, Number(attacker.damage || 1)));
  let next = {
    ...state,
    [enemy.hpKey]: nextHp,
    turns: Number(state.turns || 0) + 1,
    message: nextHp > 0
      ? `${attacker.name} usa ${attacker.attackName.toLowerCase()} contra ${enemy.name}. ${nextHp}/${enemy.maxHp} HP.`
      : `${attacker.name} derriba a ${enemy.name} con ${attacker.attackName.toLowerCase()}.`,
  };
  if (nextHp === 0) next = rewardEnemyDefeat(next, enemy, attacker);
  return next;
}

export function chroniclesTacticsFinishTurn(state) {
  if (!state || state.phase === 'escaped' || state.phase === 'defeated') return state;
  const playerMessage = state.message;
  const next = chroniclesResolveEnemyTurn(state);
  if (!Array.isArray(next.enemyTurnEvents) || next.enemyTurnEvents.length === 0) return next;
  const enemyMessage = next.message;
  return {
    ...next,
    message: playerMessage && enemyMessage && playerMessage !== enemyMessage
      ? `${playerMessage} ${enemyMessage}`
      : enemyMessage || playerMessage,
  };
}

export function chroniclesTacticsWait(state, memberId) {
  if (!actionAllowed(state)) return state;
  const member = memberFor(state, memberId);
  const next = {
    ...state,
    turns: Number(state.turns || 0) + 1,
    message: `${member?.name || 'La compañía'} mantiene posición. La cripta aprovecha la cortesía.`,
  };
  return chroniclesTacticsFinishTurn(next);
}

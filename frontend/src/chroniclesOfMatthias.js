export const CHRONICLES_MAP = Object.freeze([
  '#######',
  '#..X..#',
  '#.###.#',
  '#...#.#',
  '#.#S#.#',
  '#P.E..#',
  '#######',
]);

export const CHRONICLES_DIRECTIONS = Object.freeze([
  Object.freeze({ key: 'north', dx: 0, dy: -1, label: 'N' }),
  Object.freeze({ key: 'east', dx: 1, dy: 0, label: 'E' }),
  Object.freeze({ key: 'south', dx: 0, dy: 1, label: 'S' }),
  Object.freeze({ key: 'west', dx: -1, dy: 0, label: 'O' }),
]);

export const CHRONICLES_PARTY = Object.freeze([
  Object.freeze({ id: 'matthias', name: 'Matthias', role: 'Peón cronista', glyph: '♟', maxHp: 7, row: 'front', lane: 'left', attackName: 'Estocada', damage: 1, reach: 1 }),
  Object.freeze({ id: 'rook', name: 'Hildegard', role: 'Torre guardiana', glyph: '♜', maxHp: 10, row: 'front', lane: 'right', attackName: 'Embestida', damage: 2, reach: 1 }),
  Object.freeze({ id: 'bishop', name: 'Aziz', role: 'Alfil del farol', glyph: '♝', maxHp: 6, row: 'back', lane: 'left', attackName: 'Rayo diagonal', damage: 1, reach: 2 }),
  Object.freeze({ id: 'knight', name: 'Morcilla', role: 'Caballo logístico', glyph: '♞', maxHp: 8, row: 'back', lane: 'right', attackName: 'Salto brutal', damage: 1, reach: 2 }),
]);

const ENEMY_CELL = Object.freeze({ x: 3, y: 5 });

function partyState() {
  return CHRONICLES_PARTY.map((member) => ({ ...member, hp: member.maxHp }));
}

export function createChroniclesState() {
  return {
    x: 1,
    y: 5,
    direction: 1,
    enemyHp: 6,
    sigilAwake: false,
    phase: 'explore',
    party: partyState(),
    turns: 0,
    message: 'La Cripta de las Ocho Casillas. Huele a humedad y a una decisión cuestionable.',
  };
}

export function chroniclesTileAt(x, y) {
  return CHRONICLES_MAP[y]?.[x] || '#';
}

export function chroniclesEnemyAlive(state) {
  return state.enemyHp > 0;
}

export function chroniclesFrontCell(state) {
  const direction = CHRONICLES_DIRECTIONS[state.direction];
  return { x: state.x + direction.dx, y: state.y + direction.dy };
}

export function chroniclesEnemyDistanceAhead(state, maxReach = 2) {
  if (!chroniclesEnemyAlive(state)) return null;
  const direction = CHRONICLES_DIRECTIONS[state.direction];
  for (let distance = 1; distance <= maxReach; distance += 1) {
    const x = state.x + direction.dx * distance;
    const y = state.y + direction.dy * distance;
    if (chroniclesTileAt(x, y) === '#') return null;
    if (x === ENEMY_CELL.x && y === ENEMY_CELL.y) return distance;
  }
  return null;
}

function withMessage(state, message) {
  return { ...state, message, turns: state.turns + 1 };
}

function enterTile(state, x, y) {
  const tile = chroniclesTileAt(x, y);
  if (tile === 'S' && !state.sigilAwake) {
    return { ...state, x, y, sigilAwake: true, turns: state.turns + 1, message: 'El sello despierta. En alguna parte, una puerta decide dejar de ser insoportable.' };
  }
  if (tile === 'X') {
    return { ...state, x, y, phase: 'escaped', turns: state.turns + 1, message: 'Salida encontrada. Matthias anota que sobrevivir cuenta como excelencia operativa.' };
  }
  return { ...state, x, y, turns: state.turns + 1, message: 'Piedra, polvo y la sospecha de que algo respira detrás del muro.' };
}

function partyMember(state, memberId) {
  return state.party.find((member) => member.id === memberId) || null;
}

function retaliationTargetId(state, attacker) {
  if (attacker.row === 'front' && attacker.hp > 0) return attacker.id;
  const matchingFront = state.party.find((member) => member.row === 'front' && member.lane === attacker.lane && member.hp > 0);
  if (matchingFront) return matchingFront.id;
  return state.party.find((member) => member.row === 'front' && member.hp > 0)?.id || null;
}

function resolveAttack(state, memberId) {
  const attacker = partyMember(state, memberId);
  if (!attacker) return state;
  if (attacker.hp <= 0) return withMessage(state, `${attacker.name} está fuera de combate. Incluso la épica tiene límites médicos.`);

  const distance = chroniclesEnemyDistanceAhead(state, attacker.reach);
  if (!distance) {
    return withMessage(state, `${attacker.name} ejecuta ${attacker.attackName.toLowerCase()} contra absolutamente nada. La nada resiste.`);
  }

  const nextHp = Math.max(0, state.enemyHp - attacker.damage);
  if (nextHp === 0) {
    return {
      ...state,
      enemyHp: 0,
      turns: state.turns + 1,
      message: `${attacker.name} remata al peón corrompido con ${attacker.attackName.toLowerCase()}. Matthias aprueba con una cantidad ofensivamente pequeña de entusiasmo.`,
    };
  }

  if (distance > 1) {
    return {
      ...state,
      enemyHp: nextHp,
      turns: state.turns + 1,
      message: `${attacker.name} alcanza desde la retaguardia con ${attacker.attackName.toLowerCase()}. El peón sisea, demasiado lejos para devolver el golpe.`,
    };
  }

  const targetId = retaliationTargetId(state, attacker);
  const party = targetId
    ? state.party.map((member) => member.id === targetId ? { ...member, hp: Math.max(0, member.hp - 1) } : member)
    : state.party;
  const target = party.find((member) => member.id === targetId);
  return {
    ...state,
    enemyHp: nextHp,
    party,
    turns: state.turns + 1,
    message: `${attacker.name} impacta con ${attacker.attackName.toLowerCase()}. La criatura responde${target ? ` y alcanza a ${target.name}` : ''}.`,
  };
}

export function chroniclesReduce(state, action) {
  if (!state || state.phase === 'escaped') return state;
  const actionType = typeof action === 'string' ? action : action?.type;
  if (actionType === 'turn-left') return { ...state, direction: (state.direction + 3) % 4, turns: state.turns + 1, message: 'Giras a la izquierda.' };
  if (actionType === 'turn-right') return { ...state, direction: (state.direction + 1) % 4, turns: state.turns + 1, message: 'Giras a la derecha.' };

  if (actionType === 'attack') {
    return resolveAttack(state, typeof action === 'object' ? action.memberId : 'matthias');
  }

  const direction = CHRONICLES_DIRECTIONS[state.direction];
  const sign = actionType === 'backward' ? -1 : actionType === 'forward' ? 1 : 0;
  if (!sign) return state;
  const x = state.x + direction.dx * sign;
  const y = state.y + direction.dy * sign;
  const tile = chroniclesTileAt(x, y);

  if (tile === '#') return withMessage(state, 'Hay una pared. Incluso Matthias concede que atravesarla sería excesivo.');
  if (x === ENEMY_CELL.x && y === ENEMY_CELL.y && chroniclesEnemyAlive(state)) return withMessage(state, 'El peón corrompido bloquea el corredor. Convéncelo con violencia reglamentaria.');
  if (tile === 'X' && !state.sigilAwake) return withMessage(state, 'La puerta negra no cede. El sello de la cripta sigue dormido.');
  return enterTile(state, x, y);
}

export function chroniclesObjective(state) {
  if (state.phase === 'escaped') return 'Vertical slice completado';
  if (chroniclesEnemyAlive(state)) return 'Derrota al peón corrompido';
  if (!state.sigilAwake) return 'Encuentra y pisa el sello';
  return 'Regresa a la puerta negra';
}

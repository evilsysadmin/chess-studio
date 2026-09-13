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

export const CHRONICLES_ENEMIES = Object.freeze([
  Object.freeze({
    id: 'corrupted-pawn',
    name: 'peón corrompido',
    x: 3,
    y: 5,
    hpKey: 'enemyHp',
    maxHp: 6,
    retaliation: 1,
    activation: 'always',
  }),
  Object.freeze({
    id: 'gate-jailer',
    name: 'torre carcelero',
    x: 3,
    y: 1,
    hpKey: 'jailerHp',
    maxHp: 8,
    retaliation: 2,
    activation: 'sigil',
  }),
]);

function partyState() {
  return CHRONICLES_PARTY.map((member) => ({ ...member, hp: member.maxHp }));
}

export function createChroniclesState() {
  return {
    x: 1,
    y: 5,
    direction: 1,
    enemyHp: 6,
    jailerHp: 8,
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

function enemyActive(state, enemy) {
  return enemy.activation === 'always' || (enemy.activation === 'sigil' && state.sigilAwake);
}

function enemyAlive(state, enemy) {
  return enemyActive(state, enemy) && Number(state[enemy.hpKey] || 0) > 0;
}

export function chroniclesEnemyAlive(state) {
  return CHRONICLES_ENEMIES.some((enemy) => enemyAlive(state, enemy));
}

export function chroniclesActiveEnemies(state) {
  return CHRONICLES_ENEMIES.filter((enemy) => enemyAlive(state, enemy));
}

function chroniclesEnemyAt(state, x, y) {
  return CHRONICLES_ENEMIES.find((enemy) => enemy.x === x && enemy.y === y && enemyAlive(state, enemy)) || null;
}

export function chroniclesFrontCell(state) {
  const direction = CHRONICLES_DIRECTIONS[state.direction];
  return { x: state.x + direction.dx, y: state.y + direction.dy };
}

function chroniclesEnemyTargetAhead(state, maxReach = 2) {
  const direction = CHRONICLES_DIRECTIONS[state.direction];
  for (let distance = 1; distance <= maxReach; distance += 1) {
    const x = state.x + direction.dx * distance;
    const y = state.y + direction.dy * distance;
    if (chroniclesTileAt(x, y) === '#') return null;
    const enemy = chroniclesEnemyAt(state, x, y);
    if (enemy) return { enemy, distance };
  }
  return null;
}

export function chroniclesEnemyDistanceAhead(state, maxReach = 2) {
  return chroniclesEnemyTargetAhead(state, maxReach)?.distance ?? null;
}

function withMessage(state, message) {
  return { ...state, message, turns: state.turns + 1 };
}

function enterTile(state, x, y) {
  const tile = chroniclesTileAt(x, y);
  if (tile === 'S' && !state.sigilAwake) {
    return {
      ...state,
      x,
      y,
      sigilAwake: true,
      turns: state.turns + 1,
      message: 'El sello despierta. Arriba, metal contra piedra: algo pesado acaba de tomar guardia ante la puerta negra.',
    };
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

function defeatMessage(attacker, enemy) {
  if (enemy.id === 'gate-jailer') {
    return `${attacker.name} derriba a la torre carcelero con ${attacker.attackName.toLowerCase()}. La puerta, privada de personal, parece bastante menos autoritaria.`;
  }
  return `${attacker.name} remata al peón corrompido con ${attacker.attackName.toLowerCase()}. Matthias aprueba con una cantidad ofensivamente pequeña de entusiasmo.`;
}

function rangedHitMessage(attacker, enemy) {
  if (enemy.id === 'gate-jailer') {
    return `${attacker.name} castiga a la torre carcelero desde la retaguardia con ${attacker.attackName.toLowerCase()}. La mole no alcanza a devolver el golpe.`;
  }
  return `${attacker.name} alcanza desde la retaguardia con ${attacker.attackName.toLowerCase()}. El peón sisea, demasiado lejos para devolver el golpe.`;
}

function resolveAttack(state, memberId) {
  const attacker = partyMember(state, memberId);
  if (!attacker) return state;
  if (attacker.hp <= 0) return withMessage(state, `${attacker.name} está fuera de combate. Incluso la épica tiene límites médicos.`);

  const target = chroniclesEnemyTargetAhead(state, attacker.reach);
  if (!target) {
    return withMessage(state, `${attacker.name} ejecuta ${attacker.attackName.toLowerCase()} contra absolutamente nada. La nada resiste.`);
  }

  const { enemy, distance } = target;
  const nextHp = Math.max(0, Number(state[enemy.hpKey] || 0) - attacker.damage);
  if (nextHp === 0) {
    return {
      ...state,
      [enemy.hpKey]: 0,
      turns: state.turns + 1,
      message: defeatMessage(attacker, enemy),
    };
  }

  if (distance > 1) {
    return {
      ...state,
      [enemy.hpKey]: nextHp,
      turns: state.turns + 1,
      message: rangedHitMessage(attacker, enemy),
    };
  }

  const targetId = retaliationTargetId(state, attacker);
  const party = targetId
    ? state.party.map((member) => member.id === targetId ? { ...member, hp: Math.max(0, member.hp - enemy.retaliation) } : member)
    : state.party;
  const retaliationTarget = party.find((member) => member.id === targetId);
  return {
    ...state,
    [enemy.hpKey]: nextHp,
    party,
    turns: state.turns + 1,
    message: `${attacker.name} impacta con ${attacker.attackName.toLowerCase()}. ${enemy.name[0].toUpperCase()}${enemy.name.slice(1)} responde${retaliationTarget ? ` y alcanza a ${retaliationTarget.name}` : ''}.`,
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
  const blockingEnemy = chroniclesEnemyAt(state, x, y);
  if (blockingEnemy) {
    const message = blockingEnemy.id === 'gate-jailer'
      ? 'La torre carcelero sella la puerta negra. Es una cerradura de varias toneladas y bastante mal humor.'
      : 'El peón corrompido bloquea el corredor. Convéncelo con violencia reglamentaria.';
    return withMessage(state, message);
  }
  if (tile === 'X' && !state.sigilAwake) return withMessage(state, 'La puerta negra no cede. El sello de la cripta sigue dormido.');
  return enterTile(state, x, y);
}

export function chroniclesObjective(state) {
  if (state.phase === 'escaped') return 'Vertical slice completado';
  if (state.enemyHp > 0) return 'Derrota al peón corrompido';
  if (!state.sigilAwake) return 'Encuentra y pisa el sello';
  if (state.jailerHp > 0) return 'Derrota a la torre carcelero';
  return 'Cruza la puerta negra';
}

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
  Object.freeze({ id: 'matthias', name: 'Matthias', role: 'Peón cronista', glyph: '♟', maxHp: 7 }),
  Object.freeze({ id: 'rook', name: 'Hildegard', role: 'Torre guardiana', glyph: '♜', maxHp: 10 }),
  Object.freeze({ id: 'bishop', name: 'Aziz', role: 'Alfil del farol', glyph: '♝', maxHp: 6 }),
  Object.freeze({ id: 'knight', name: 'Morcilla', role: 'Caballo logístico', glyph: '♞', maxHp: 8 }),
]);

function partyState() {
  return CHRONICLES_PARTY.map((member) => ({ ...member, hp: member.maxHp }));
}

export function createChroniclesState() {
  return {
    x: 1,
    y: 5,
    direction: 1,
    enemyHp: 2,
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

export function chroniclesReduce(state, action) {
  if (!state || state.phase === 'escaped') return state;
  if (action === 'turn-left') return { ...state, direction: (state.direction + 3) % 4, turns: state.turns + 1, message: 'Giras a la izquierda.' };
  if (action === 'turn-right') return { ...state, direction: (state.direction + 1) % 4, turns: state.turns + 1, message: 'Giras a la derecha.' };

  if (action === 'attack') {
    const front = chroniclesFrontCell(state);
    if (front.x !== 3 || front.y !== 5 || !chroniclesEnemyAlive(state)) {
      return withMessage(state, 'Golpeas el aire. El aire, sorprendentemente, sobrevive.');
    }
    const nextHp = Math.max(0, state.enemyHp - 1);
    if (nextHp === 0) return { ...state, enemyHp: 0, turns: state.turns + 1, message: 'El peón corrompido cae. Matthias parece ofendido por su falta de disciplina.' };
    const party = state.party.map((member, index) => index === 0 ? { ...member, hp: Math.max(1, member.hp - 1) } : member);
    return { ...state, enemyHp: nextHp, party, turns: state.turns + 1, message: 'Impacto. La criatura responde y araña el orgullo —y 1 HP— de Matthias.' };
  }

  const direction = CHRONICLES_DIRECTIONS[state.direction];
  const sign = action === 'backward' ? -1 : action === 'forward' ? 1 : 0;
  if (!sign) return state;
  const x = state.x + direction.dx * sign;
  const y = state.y + direction.dy * sign;
  const tile = chroniclesTileAt(x, y);

  if (tile === '#') return withMessage(state, 'Hay una pared. Incluso Matthias concede que atravesarla sería excesivo.');
  if (x === 3 && y === 5 && chroniclesEnemyAlive(state)) return withMessage(state, 'El peón corrompido bloquea el corredor. Convéncelo con violencia reglamentaria.');
  if (tile === 'X' && !state.sigilAwake) return withMessage(state, 'La puerta negra no cede. El sello de la cripta sigue dormido.');
  return enterTile(state, x, y);
}

export function chroniclesObjective(state) {
  if (state.phase === 'escaped') return 'Vertical slice completado';
  if (chroniclesEnemyAlive(state)) return 'Derrota al peón corrompido';
  if (!state.sigilAwake) return 'Encuentra y pisa el sello';
  return 'Regresa a la puerta negra';
}

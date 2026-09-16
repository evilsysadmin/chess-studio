import {
  DEFAULT_CHRONICLES_MAP_ID,
  chroniclesMapById,
  chroniclesMapForState,
  chroniclesMapInitialEnemyState,
  chroniclesMapTileAt,
} from './chronicles/chroniclesMapCatalog.js';
import { chroniclesApplyContentEffects } from './chronicles/chroniclesContentRuntime.js';

const DEFAULT_MAP = chroniclesMapById(DEFAULT_CHRONICLES_MAP_ID);

export const CHRONICLES_MAP = DEFAULT_MAP.grid;

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
  Object.freeze({ id: 'knight', name: 'Faust', role: 'Caballo logístico', glyph: '♞', maxHp: 8, row: 'back', lane: 'right', attackName: 'Salto brutal', damage: 1, reach: 2 }),
]);

export const CHRONICLES_ENEMIES = DEFAULT_MAP.enemies;

const INITIAL_JOURNAL = DEFAULT_MAP.initialJournal;

function enemiesFor(state) {
  return chroniclesMapForState(state).enemies;
}

function partyState() {
  return CHRONICLES_PARTY.map((member) => ({ ...member, hp: member.maxHp }));
}

function appendJournal(state, entry) {
  const journal = Array.isArray(state.journal) ? state.journal : [chroniclesMapForState(state).initialJournal];
  if (journal.some((item) => item.id === entry.id)) return state;
  return { ...state, journal: [...journal, entry] };
}

export function chroniclesJournalEntries(state) {
  const initialJournal = chroniclesMapForState(state).initialJournal || INITIAL_JOURNAL;
  return Array.isArray(state?.journal) && state.journal.length ? state.journal : [initialJournal];
}

export function createChroniclesState(mapId = DEFAULT_CHRONICLES_MAP_ID) {
  const map = chroniclesMapById(mapId);
  return {
    mapId: map.id,
    x: map.partyStart.x,
    y: map.partyStart.y,
    direction: map.partyStart.direction,
    ...chroniclesMapInitialEnemyState(map.id),
    ...map.initialFlags,
    phase: 'explore',
    party: partyState(),
    turns: 0,
    journal: [map.initialJournal],
    message: map.introMessage,
  };
}

export function chroniclesTileAt(x, y, stateOrMapId = null) {
  const map = typeof stateOrMapId === 'string'
    ? chroniclesMapById(stateOrMapId)
    : stateOrMapId
      ? chroniclesMapForState(stateOrMapId)
      : DEFAULT_MAP;
  return chroniclesMapTileAt(map, x, y);
}

export function chroniclesEnemyIsActive(state, enemy) {
  if (enemy.activation === 'always') return true;
  if (enemy.activation === 'sigil') return Boolean(state.sigilAwake);
  if (enemy.activation === 'jailer-down') return Boolean(state.sigilAwake && state.jailerHp <= 0);
  return false;
}

function enemyAlive(state, enemy) {
  return chroniclesEnemyIsActive(state, enemy) && Number(state[enemy.hpKey] || 0) > 0;
}

export function chroniclesEnemyAlive(state) {
  return enemiesFor(state).some((enemy) => enemyAlive(state, enemy));
}

export function chroniclesActiveEnemies(state) {
  return enemiesFor(state).filter((enemy) => enemyAlive(state, enemy));
}

export function chroniclesEnemyPosition(state, enemy) {
  const keyed = enemy.positionKey && enemy.positions ? enemy.positions[state?.[enemy.positionKey]] : null;
  return keyed || { x: enemy.x, y: enemy.y };
}

function chroniclesEnemyAt(state, x, y) {
  return enemiesFor(state).find((enemy) => {
    if (!enemyAlive(state, enemy)) return false;
    const position = chroniclesEnemyPosition(state, enemy);
    return position.x === x && position.y === y;
  }) || null;
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
    if (chroniclesTileAt(x, y, state) === '#') return null;
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
  const tile = chroniclesTileAt(x, y, state);
  if (tile === 'S' && !state.sigilAwake) {
    return appendJournal({
      ...state,
      x,
      y,
      sigilAwake: true,
      turns: state.turns + 1,
      message: 'El sello despierta. Arriba, metal contra piedra. Al este, una luz verdosa abre los ojos en una capilla que nadie había solicitado.',
    }, {
      id: 'sigil-awake',
      title: 'El sello responde',
      body: 'La piedra arde bajo el grupo. Una torre toma guardia ante la salida y, al este, algo diagonal empieza a rezar al revés.',
      sigil: 'III',
    });
  }
  if (tile === 'X') {
    return appendJournal({
      ...state,
      x,
      y,
      phase: 'escaped',
      turns: state.turns + 1,
      message: 'Salida encontrada. Matthias anota que sobrevivir cuenta como excelencia operativa.',
    }, {
      id: 'escape',
      title: 'Salida, técnicamente gloriosa',
      body: 'La compañía abandona la cripta. Matthias registra la supervivencia como victoria y omite prudentemente el olor.',
      sigil: 'VII',
    });
  }
  return { ...state, x, y, turns: state.turns + 1 };
}

function partyMember(state, memberId) {
  return state.party.find((member) => member.id === memberId) || null;
}

function retaliationTargetId(state, attacker) {
  if (attacker.row === 'front' && attacker.hp > 0) return attacker.id;
  const matchingFront = state.party.find((member) => member.row === 'front' && member.lane === attacker.lane && member.hp > 0);
  if (matchingFront) return matchingFront.id;
  return state.party.find((member) => member.row === 'front' && member.hp > 0)?.id || attacker.id;
}

function renderCombatTemplate(template, attacker, enemy) {
  if (typeof template !== 'string' || !template) return '';
  const values = {
    attacker: attacker.name,
    attack: attacker.attackName.toLowerCase(),
    enemy: enemy.name,
  };
  return Object.entries(values).reduce(
    (text, [key, value]) => text.split(`{${key}}`).join(value),
    template,
  );
}

function defeatMessage(attacker, enemy) {
  const authored = renderCombatTemplate(enemy.onDefeat?.message, attacker, enemy);
  if (authored) return authored;
  return `${attacker.name} derrota a ${enemy.name} con ${attacker.attackName.toLowerCase()}. La expedición continúa.`;
}

function rangedHitMessage(attacker, enemy) {
  const authored = renderCombatTemplate(enemy.rangedHitMessage, attacker, enemy);
  if (authored) return authored;
  return `${attacker.name} alcanza a ${enemy.name} desde la retaguardia con ${attacker.attackName.toLowerCase()}. El objetivo queda demasiado lejos para devolver el golpe.`;
}

function rewardForDefeat(state, enemy) {
  return chroniclesApplyContentEffects(state, enemy.onDefeat?.effects);
}

function journalForDefeat(state, attacker, enemy) {
  const authored = enemy.onDefeat?.journal;
  if (!authored) {
    return appendJournal(state, {
      id: `${enemy.id}-falls`,
      title: `${enemy.name[0].toUpperCase()}${enemy.name.slice(1)} cae`,
      body: `${attacker.name} firma la baja. La expedición continúa con una criatura menos y exactamente la misma mala idea de fondo.`,
      sigil: '†',
    });
  }
  return appendJournal(state, {
    ...authored,
    title: renderCombatTemplate(authored.title, attacker, enemy),
    body: renderCombatTemplate(authored.body, attacker, enemy),
  });
}

function evadeAfterHit(state, enemy) {
  if (!enemy.evadesOnHit || !enemy.positionKey || !enemy.positions) return state;
  const positionKeys = Object.keys(enemy.positions);
  if (positionKeys.length < 2) return state;
  const currentIndex = Math.max(0, positionKeys.indexOf(state[enemy.positionKey]));
  const nextPosition = positionKeys[(currentIndex + 1) % positionKeys.length];
  return {
    ...state,
    [enemy.positionKey]: nextPosition,
    message: `${state.message} ${enemy.name[0].toUpperCase()}${enemy.name.slice(1)} se escabulle hacia otra posición del mapa.`,
  };
}
function resolveAttack(state, memberId) {
  const attacker = partyMember(state, memberId);
  if (!attacker) return state;
  if (attacker.hp <= 0) return withMessage(state, `${attacker.name} está fuera de combate. Incluso la épica tiene límites médicos.`);

  const target = chroniclesEnemyTargetAhead(state, attacker.reach);
  if (!target) return withMessage(state, `${attacker.name} ejecuta ${attacker.attackName.toLowerCase()} contra absolutamente nada. La nada resiste.`);

  const { enemy, distance } = target;
  const nextHp = Math.max(0, Number(state[enemy.hpKey] || 0) - attacker.damage);
  if (nextHp === 0) {
    const defeated = rewardForDefeat({ ...state, [enemy.hpKey]: 0, turns: state.turns + 1, message: defeatMessage(attacker, enemy) }, enemy);
    return journalForDefeat(defeated, attacker, enemy);
  }

  const retaliationReach = Number(enemy.retaliationReach ?? enemy.ai?.attackReach ?? 1);
  if (distance > retaliationReach) {
    return evadeAfterHit({ ...state, [enemy.hpKey]: nextHp, turns: state.turns + 1, message: rangedHitMessage(attacker, enemy) }, enemy);
  }

  const targetId = retaliationTargetId(state, attacker);
  const previousTarget = state.party.find((member) => member.id === targetId);
  const party = targetId
    ? state.party.map((member) => member.id === targetId ? { ...member, hp: Math.max(0, member.hp - enemy.retaliation) } : member)
    : state.party;
  const retaliationTarget = party.find((member) => member.id === targetId);
  let nextState = {
    ...state,
    [enemy.hpKey]: nextHp,
    party,
    turns: state.turns + 1,
    message: `${attacker.name} impacta con ${attacker.attackName.toLowerCase()}. ${enemy.name[0].toUpperCase()}${enemy.name.slice(1)} responde${retaliationTarget ? ` y alcanza a ${retaliationTarget.name}` : ''}.`,
  };
  if (previousTarget?.hp > 0 && retaliationTarget?.hp === 0) {
    nextState = appendJournal(nextState, {
      id: `down-${retaliationTarget.id}`,
      title: `${retaliationTarget.name} cae`,
      body: `${retaliationTarget.name} queda fuera de combate. Matthias deja un espacio en el margen para comentarios médicamente inapropiados.`,
      sigil: '†',
    });
  }
  return evadeAfterHit(nextState, enemy);
}

function blockingEnemyMessage(enemy) {
  if (enemy.blockingMessage) return enemy.blockingMessage;
  return `${enemy.name[0].toUpperCase()}${enemy.name.slice(1)} bloquea el paso. Convéncelo con violencia reglamentaria.`;
}

export function chroniclesReduce(state, action) {
  if (!state || state.phase === 'escaped') return state;
  const actionType = typeof action === 'string' ? action : action?.type;
  if (actionType === 'turn-left') return { ...state, direction: (state.direction + 3) % 4, turns: state.turns + 1 };
  if (actionType === 'turn-right') return { ...state, direction: (state.direction + 1) % 4, turns: state.turns + 1 };
  if (actionType === 'attack') return resolveAttack(state, typeof action === 'object' ? action.memberId : 'matthias');

  const direction = CHRONICLES_DIRECTIONS[state.direction];
  const sign = actionType === 'backward' ? -1 : actionType === 'forward' ? 1 : 0;
  if (!sign) return state;
  const x = state.x + direction.dx * sign;
  const y = state.y + direction.dy * sign;
  const tile = chroniclesTileAt(x, y, state);

  if (tile === '#') return withMessage(state, 'Hay una pared. Incluso Matthias concede que atravesarla sería excesivo.');
  const blockingEnemy = chroniclesEnemyAt(state, x, y);
  if (blockingEnemy) return withMessage(state, blockingEnemyMessage(blockingEnemy));
  if (tile === 'X' && !state.sigilAwake) return withMessage(state, 'La puerta negra no cede. El sello de la cripta sigue dormido.');
  if (tile === 'X' && state.jailerHp <= 0 && !state.blackGateKey) return withMessage(state, 'La puerta está libre, sí. La Llave Negra no: el caballo carroñero se la ha llevado saltando como un imbécil reglamentario.');
  return enterTile(state, x, y);
}

export function chroniclesObjective(state) {
  if (state.phase === 'escaped') return 'Vertical slice completado';
  if (state.enemyHp > 0) return 'Derrota al peón corrompido';
  if (!state.sigilAwake) return 'Encuentra y pisa el sello';
  if (state.jailerHp > 0) return 'Derrota a la torre carcelero';
  if (state.scavengerHp > 0) return 'Caza al caballo carroñero';
  return 'Cruza la puerta negra';
}

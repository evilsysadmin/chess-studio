import {
  CHRONICLES_DIRECTIONS,
  chroniclesActiveEnemies,
  chroniclesTileAt,
} from './chroniclesOfMatthias.js';
import {
  chroniclesResolveEnemyTurn,
  chroniclesRuntimeEnemyPosition,
} from './chroniclesOfMatthiasTurns.js';
import { chroniclesMapForState } from './chronicles/chroniclesMapCatalog.js';

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

export function chroniclesTacticsWorld(state = null) {
  const map = chroniclesMapForState(state);
  const lever = map.interactables.find((entry) => entry.kind === 'lever') || null;
  const runeCore = map.treasures.find((entry) => entry.id === 'rune-core')
    || map.interactables.find((entry) => entry.id === 'rune-core')
    || null;
  return { lever, runeCore };
}

// Compatibility snapshot for the current single-map renderer. Runtime tactics
// logic resolves the world from state so future maps do not inherit these cells.
export const CHRONICLES_TACTICS_WORLD = Object.freeze(chroniclesTacticsWorld());

const CLASS_PROFILES = Object.freeze({
  matthias: Object.freeze({
    className: 'Espadachín',
    weaponName: 'Espada corta',
    attackName: 'Estocada teutona',
    attackKind: 'melee',
    kindLabel: 'cuerpo a cuerpo',
    attackPattern: 'adjacent',
    reach: 1,
    damage: 2,
    abilityName: 'Ruptura teutona',
    abilityKind: 'burst',
    abilityLabel: 'golpe de ejecución',
    abilityDamage: 4,
  }),
  rook: Object.freeze({
    className: 'Guardiana',
    weaponName: 'Maza de torre',
    attackName: 'Embestida de torre',
    attackKind: 'heavy',
    kindLabel: 'línea pesada',
    attackPattern: 'orthogonal',
    reach: 2,
    damage: 2,
    abilityName: 'Martillo de asedio',
    abilityKind: 'burst',
    abilityLabel: 'impacto pesado',
    abilityDamage: 4,
  }),
  bishop: Object.freeze({
    className: 'Taumaturgo',
    weaponName: 'Farol rúnico',
    attackName: 'Rayo diagonal',
    attackKind: 'spell',
    kindLabel: 'conjuro diagonal',
    attackPattern: 'diagonal',
    reach: 4,
    damage: 2,
    abilityName: 'Luz del farol',
    abilityKind: 'heal',
    abilityLabel: 'conjuro de apoyo',
    abilityHeal: 2,
  }),
  knight: Object.freeze({
    className: 'Hostigador',
    weaponName: 'Ballesta de estribo',
    attackName: 'Virote largo',
    attackKind: 'ranged',
    kindLabel: 'arma a distancia',
    attackPattern: 'line',
    reach: 3,
    damage: 1,
    abilityName: 'Salva de virotes',
    abilityKind: 'volley',
    abilityLabel: 'salva a distancia',
    abilityDamage: 2,
    abilityMaxTargets: 2,
  }),
});

const FALLBACK_PROFILE = Object.freeze({
  className: 'Aventurero',
  weaponName: 'Arma improvisada',
  attackName: 'Golpe',
  attackKind: 'melee',
  kindLabel: 'cuerpo a cuerpo',
  attackPattern: 'adjacent',
  reach: 1,
  damage: 1,
  abilityName: 'Recurso desesperado',
  abilityKind: 'burst',
  abilityLabel: 'maniobra',
  abilityDamage: 2,
});

export function chroniclesTacticsProfile(memberId) {
  return CLASS_PROFILES[memberId] || FALLBACK_PROFILE;
}

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
  const spanX = Math.abs(to.x - from.x);
  const spanY = Math.abs(to.y - from.y);
  const straight = spanX === 0 || spanY === 0;
  const diagonal = spanX === spanY;
  if (!straight && !diagonal) return false;

  const dx = Math.sign(to.x - from.x);
  const dy = Math.sign(to.y - from.y);
  let x = from.x + dx;
  let y = from.y + dy;
  while (x !== to.x || y !== to.y) {
    if (chroniclesTileAt(x, y, state) === '#') return false;
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

function attackDistance(state, position, profile) {
  const dx = Math.abs(position.x - state.x);
  const dy = Math.abs(position.y - state.y);
  if (profile.attackPattern === 'adjacent') return dx + dy === 1 ? 1 : null;
  if (profile.attackPattern === 'orthogonal') {
    if (dx !== 0 && dy !== 0) return null;
    return dx + dy;
  }
  if (profile.attackPattern === 'diagonal') return dx === dy && dx > 0 ? dx : null;
  if (profile.attackPattern === 'line') {
    if (!(dx === 0 || dy === 0 || dx === dy)) return null;
    return Math.max(dx, dy);
  }
  return null;
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

function rpgModifiers(state, memberId) {
  const source = state?.rpgModifiers?.[memberId];
  return source && typeof source === 'object' ? source : {};
}

function effectiveReach(state, memberId, profile) {
  return Math.max(1, Number(profile.reach || 1) + Math.max(0, Number(rpgModifiers(state, memberId).reachBonus || 0)));
}

function effectiveAttackDamage(state, memberId, profile) {
  return Math.max(1, Number(profile.damage || 1) + Math.max(0, Number(rpgModifiers(state, memberId).attackDamageBonus || 0)));
}

function effectiveAbilityPotency(state, memberId) {
  return Math.max(0, Number(rpgModifiers(state, memberId).abilityPotencyBonus || 0));
}

function maxAbilityCharges(state, memberId) {
  return Math.max(1, Number(rpgModifiers(state, memberId).abilityCharges || 1));
}

function abilityCharges(state, memberId) {
  return Math.max(0, Number(state?.classAbilityCharges?.[memberId] ?? maxAbilityCharges(state, memberId)));
}

function consumeAbilityCharge(state, memberId) {
  return {
    ...state,
    classAbilityCharges: {
      ...(state.classAbilityCharges || {}),
      [memberId]: Math.max(0, abilityCharges(state, memberId) - 1),
    },
  };
}

function refillAbilityCharges(state) {
  const classAbilityCharges = { ...(state.classAbilityCharges || {}) };
  state.party.forEach((member) => {
    classAbilityCharges[member.id] = maxAbilityCharges(state, member.id);
  });
  return { ...state, classAbilityCharges };
}

function adjacentExit(state) {
  return CHRONICLES_DIRECTIONS
    .map((direction) => ({
      x: state.x + direction.dx,
      y: state.y + direction.dy,
      direction: direction.key,
    }))
    .find((position) => chroniclesTileAt(position.x, position.y, state) === 'X') || null;
}

function lockedGateMessage(state) {
  if (!state.sigilAwake) return 'La Puerta Negra no responde. Algo en la cripta sigue dormido, por desgracia temporalmente.';
  if (state.jailerHp > 0) return 'La Puerta Negra no cede mientras la torre carcelero siga defendiendo el umbral.';
  if (!state.blackGateKey) return 'La cerradura exige la Llave Negra. Alguien con pezuñas la considera propiedad privada.';
  return 'La Puerta Negra permanece cerrada con una obstinación administrativamente impecable.';
}

export function chroniclesTacticsInteractions(state) {
  if (!actionAllowed(state)) return [];
  const interactions = [];
  const world = chroniclesTacticsWorld(state);

  if (chroniclesTileAt(state.x, state.y, state) === 'S' && !state.sigilAwake) {
    interactions.push({
      id: 'ancient-sigil',
      kind: 'trigger',
      label: 'Activar sello',
      x: state.x,
      y: state.y,
    });
  }

  if (world.lever && sameCell(state, world.lever) && !state.runeCacheOpened) {
    interactions.push({
      ...world.lever,
      kind: 'lever',
      label: 'Accionar palanca',
    });
  }

  if (world.runeCore && sameCell(state, world.runeCore) && state.runeCacheOpened && !state.runeCoreCollected) {
    interactions.push({
      ...world.runeCore,
      kind: 'pickup',
      label: 'Recoger núcleo rúnico',
    });
  }

  const exit = adjacentExit(state);
  if (exit) {
    interactions.push({
      id: 'black-gate',
      kind: 'exit',
      label: canUseExit(state) ? 'Abrir Puerta Negra' : 'Examinar Puerta Negra',
      x: exit.x,
      y: exit.y,
      direction: exit.direction,
    });
  }

  return interactions;
}

export function chroniclesTacticsUse(state, interactionId = null) {
  const interaction = chroniclesTacticsInteractions(state).find((candidate) => (
    !interactionId || candidate.id === interactionId
  ));
  if (!interaction) return state;
  const world = chroniclesTacticsWorld(state);

  const turns = Number(state.turns || 0) + 1;
  if (interaction.id === 'ancient-sigil') {
    return appendJournal({
      ...state,
      sigilAwake: true,
      turns,
      message: 'La compañía activa el sello. La piedra despierta y más piezas hostiles entran en la partida.',
    }, {
      id: 'tactics-sigil-awake',
      title: 'El sello despierta',
      body: 'La formación activa el sello de la cripta. Torre y alfil reciben la noticia con una hostilidad muy profesional.',
      sigil: 'III',
    });
  }

  if (world.lever && interaction.id === world.lever.id) {
    return appendJournal({
      ...state,
      runeCacheOpened: true,
      turns,
      message: 'La palanca baja con un golpe seco. Una hornacina cercana expulsa un núcleo rúnico con la discreción de una tostadora medieval.',
    }, {
      id: 'tactics-rune-cache-open',
      title: 'La pared admite que tenía compartimento secreto',
      body: 'Una palanca de latón abre un pequeño alijo. Dentro espera un núcleo rúnico capaz de rearmar las habilidades de la compañía.',
      sigil: '✦',
    });
  }

  if (world.runeCore && interaction.id === world.runeCore.id) {
    return appendJournal(refillAbilityCharges({
      ...state,
      runeCoreCollected: true,
      turns,
      message: 'La compañía recoge el núcleo rúnico. Las habilidades de clase vuelven a estar cargadas. Aziz lo llama taumaturgia; Matthias, logística cara.',
    }), {
      id: 'tactics-rune-core-collected',
      title: 'Núcleo rúnico recuperado',
      body: 'El alijo recarga las habilidades de clase una vez. Nadie pregunta quién dejó una batería arcana en una cripta.',
      sigil: '✦',
    });
  }

  if (interaction.id === 'black-gate') {
    if (!canUseExit(state)) {
      return {
        ...state,
        turns,
        message: lockedGateMessage(state),
      };
    }
    return appendJournal({
      ...state,
      phase: 'escaped',
      turns,
      message: 'La compañía abre la Puerta Negra y abandona la cripta. Sobrevivir sigue siendo una métrica de rendimiento perfectamente válida.',
    }, {
      id: 'tactics-escape',
      title: 'Extracción completada',
      body: 'La compañía abandona la cripta táctica con más miembros que cadáveres. Matthias lo registra como excelencia.',
      sigil: 'VII',
    });
  }

  return state;
}

export function chroniclesTacticsLegalMoves(state) {
  if (!actionAllowed(state)) return [];
  return CHRONICLES_DIRECTIONS.flatMap((direction) => {
    const position = { x: state.x + direction.dx, y: state.y + direction.dy };
    const tile = chroniclesTileAt(position.x, position.y, state);
    if (tile === '#' || tile === 'X') return [];
    if (occupiedByEnemy(state, position)) return [];
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
  const profile = chroniclesTacticsProfile(memberId);
  const reach = effectiveReach(state, memberId, profile);

  return activeEnemiesWithPositions(state)
    .flatMap(({ enemy, position }) => {
      const distance = attackDistance(state, position, profile);
      if (distance === null || distance < 1 || distance > reach) return [];
      if (!lineIsClear(state, { x: state.x, y: state.y }, position, enemy.id)) return [];
      return [{
        enemyId: enemy.id,
        name: enemy.name,
        hp: Math.max(0, Number(state[enemy.hpKey] || 0)),
        maxHp: enemy.maxHp,
        distance,
        x: position.x,
        y: position.y,
        attackKind: profile.attackKind,
      }];
    })
    .sort((left, right) => left.distance - right.distance || left.enemyId.localeCompare(right.enemyId));
}

export function chroniclesTacticsAbilityStatus(state, memberId) {
  const profile = chroniclesTacticsProfile(memberId);
  const member = memberFor(state, memberId);
  const charges = abilityCharges(state, memberId);
  if (!actionAllowed(state) || !member || member.hp <= 0) {
    return { ready: false, charges, abilityName: profile.abilityName, reason: 'No disponible' };
  }
  if (charges <= 0) {
    return { ready: false, charges, abilityName: profile.abilityName, reason: 'Agotada' };
  }
  if (profile.abilityKind === 'heal') {
    const wounded = state.party.some((candidate) => candidate.hp > 0 && candidate.hp < candidate.maxHp);
    return {
      ready: wounded,
      charges,
      abilityName: profile.abilityName,
      reason: wounded ? '' : 'Nadie necesita curación',
    };
  }
  const targets = chroniclesTacticsTargets(state, memberId);
  return {
    ready: targets.length > 0,
    charges,
    abilityName: profile.abilityName,
    reason: targets.length > 0 ? '' : 'Sin objetivo válido',
  };
}

export function chroniclesTacticsAbility(state, memberId) {
  const status = chroniclesTacticsAbilityStatus(state, memberId);
  if (!status.ready) return state;
  const profile = chroniclesTacticsProfile(memberId);
  const attacker = memberFor(state, memberId);
  if (!attacker) return state;
  const turns = Number(state.turns || 0) + 1;
  const potencyBonus = effectiveAbilityPotency(state, memberId);

  if (profile.abilityKind === 'heal') {
    const healing = Math.max(1, Number(profile.abilityHeal || 1) + potencyBonus);
    const healedParty = state.party.map((member) => (
      member.hp > 0
        ? { ...member, hp: Math.min(member.maxHp, member.hp + healing) }
        : member
    ));
    return consumeAbilityCharge({
      ...state,
      party: healedParty,
      turns,
      message: `${attacker.name} invoca ${profile.abilityName}. El farol recompone a los supervivientes con una luz que parece cara.`,
    }, memberId);
  }

  const targets = chroniclesTacticsTargets(state, memberId);
  const selectedTargets = profile.abilityKind === 'volley'
    ? targets.slice(0, Math.max(1, Number(profile.abilityMaxTargets || 1)))
    : targets.slice(0, 1);
  let next = { ...state, turns };
  const hitNames = [];

  selectedTargets.forEach((target) => {
    const enemy = chroniclesActiveEnemies(next).find((candidate) => candidate.id === target.enemyId);
    if (!enemy) return;
    const damage = Math.max(1, Number(profile.abilityDamage || profile.damage || 1) + potencyBonus);
    const nextHp = Math.max(0, Number(next[enemy.hpKey] || 0) - damage);
    next = { ...next, [enemy.hpKey]: nextHp };
    hitNames.push(enemy.name);
    if (nextHp === 0) next = rewardEnemyDefeat(next, enemy, attacker);
  });

  if (!hitNames.length) return state;
  next = {
    ...next,
    message: `${attacker.name} desata ${profile.abilityName.toLowerCase()} contra ${hitNames.join(' y ')}. La sutileza queda para otra expedición.`,
  };
  return consumeAbilityCharge(next, memberId);
}

export function chroniclesTacticsMove(state, destination) {
  const legal = chroniclesTacticsLegalMoves(state).find((move) => move.x === destination?.x && move.y === destination?.y);
  if (!legal) return state;

  return {
    ...state,
    x: legal.x,
    y: legal.y,
    turns: Number(state.turns || 0) + 1,
    message: `La compañía avanza hacia ${legal.label.toLowerCase()}. Piedra, formación y malas intenciones.`,
  };
}

export function chroniclesTacticsAttack(state, memberId, enemyId) {
  const target = chroniclesTacticsTargets(state, memberId).find((candidate) => candidate.enemyId === enemyId);
  const attacker = memberFor(state, memberId);
  if (!target || !attacker) return state;
  const enemy = chroniclesActiveEnemies(state).find((candidate) => candidate.id === enemyId);
  if (!enemy) return state;
  const profile = chroniclesTacticsProfile(memberId);
  const damage = effectiveAttackDamage(state, memberId, profile);

  const nextHp = Math.max(0, Number(state[enemy.hpKey] || 0) - damage);
  let next = {
    ...state,
    [enemy.hpKey]: nextHp,
    turns: Number(state.turns || 0) + 1,
    message: nextHp > 0
      ? `${attacker.name} usa ${profile.attackName.toLowerCase()} contra ${enemy.name}. ${nextHp}/${enemy.maxHp} HP.`
      : `${attacker.name} derriba a ${enemy.name} con ${profile.attackName.toLowerCase()}.`,
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

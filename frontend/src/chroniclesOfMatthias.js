import {
  DEFAULT_CHRONICLES_MAP_ID,
  chroniclesMapById,
  chroniclesMapForState,
  chroniclesMapContentPosition,
  chroniclesMapInitialEnemyState,
  chroniclesMapTileAt,
  chroniclesRuntimeEntryMapId,
} from './chronicles/chroniclesMapCatalog.js';
import {
  chroniclesApplyContentAction,
  chroniclesApplyContentEffects,
  chroniclesContentDefinition,
  chroniclesContentInteractions,
  chroniclesContentVisible,
  chroniclesQuestEntries,
  chroniclesRequirementFailure,
  chroniclesRequirementMet,
  chroniclesRequirementsMet,
} from './chronicles/chroniclesContentRuntime.js';
import { resolveChroniclesCharacterParty } from './chronicles/chroniclesCharacterBuilds.js';
import { chroniclesEquipItem, chroniclesUnequipItem, chroniclesEquipmentBonuses } from './chronicles/chroniclesEquipment.js';
import {
  chroniclesCloseShop, chroniclesOpenShop, chroniclesShopBuy, chroniclesShopSell,
} from './chronicles/chroniclesShops.js';
import {
  chroniclesCloseGuild, chroniclesGuildJoin, chroniclesGuildLearn, chroniclesOpenGuild,
} from './chronicles/chroniclesGuild.js';
import {
  CHRONICLES_ELEMENT_LABELS,
  CHRONICLES_SPELLS,
  chroniclesDetectMagicMessage,
  chroniclesMemberKnowsSpell,
  chroniclesMemberSp,
  chroniclesMostWoundedAlly,
  chroniclesSpellDamage,
  chroniclesSpendSp,
} from './chronicles/chroniclesMagic.js';
import {
  chroniclesMM3AttackHits,
  chroniclesMM3EnemyArmorClass,
  chroniclesMM3EnemyToHit,
  chroniclesMM3Roll,
} from './chronicles/chroniclesMM3Rules.js';
import { chroniclesAdvanceLostKingIntro } from './chronicles/chroniclesLostKingIntro.js';
import { CHRONICLES_SWORDHAVEN_RETURN_PORTAL_ID, chroniclesSwordhavenReturnAvailable } from './chronicles/chroniclesSwordhavenReturnPortal.js';
import { chroniclesIsOverworldTravelExit } from './chronicles/chroniclesWorldReturnLinks.js';

const DEFAULT_MAP = chroniclesMapById(DEFAULT_CHRONICLES_MAP_ID);

export const CHRONICLES_MAP = DEFAULT_MAP.grid;

export const CHRONICLES_DIRECTIONS = Object.freeze([
  Object.freeze({ key: 'north', dx: 0, dy: -1, label: 'N' }),
  Object.freeze({ key: 'east', dx: 1, dy: 0, label: 'E' }),
  Object.freeze({ key: 'south', dx: 0, dy: 1, label: 'S' }),
  Object.freeze({ key: 'west', dx: -1, dy: 0, label: 'O' }),
]);

export const CHRONICLES_PARTY = Object.freeze([
  Object.freeze({ id: 'matthias', name: 'Matthias', role: 'Peón cronista', glyph: '♟', maxHp: 7, agility: 4, row: 'front', lane: 'left', attackName: 'Estocada', damage: 1, reach: 1 }),
  Object.freeze({ id: 'rook', name: 'Hildegard', role: 'Torre guardiana', glyph: '♜', maxHp: 10, agility: 2, row: 'front', lane: 'right', attackName: 'Embestida', damage: 2, reach: 1 }),
  Object.freeze({ id: 'bishop', name: 'Aziz', role: 'Alfil del farol', glyph: '♝', maxHp: 6, agility: 3, row: 'back', lane: 'left', attackName: 'Rayo diagonal', damage: 1, reach: 2 }),
  Object.freeze({ id: 'knight', name: 'Faust', role: 'Caballo logístico', glyph: '♞', maxHp: 8, agility: 5, row: 'back', lane: 'right', attackName: 'Salto brutal', damage: 1, reach: 2 }),
]);

export const CHRONICLES_ENEMIES = DEFAULT_MAP.enemies;

const INITIAL_JOURNAL = DEFAULT_MAP.initialJournal;

const FIRST_PERSON_ADJACENT_INTERACTION_KINDS = new Set([
  'lever',
  'button',
  'lore',
  'relic-socket',
  'secret-door',
]);

function enemiesFor(state) {
  return chroniclesMapForState(state).enemies;
}

function partyState(characterBuild = null, rules = null) {
  return resolveChroniclesCharacterParty(CHRONICLES_PARTY, characterBuild, { rules })
    .map((member) => ({ ...member, hp: member.maxHp }));
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

// `rules: 'mm3'` turns on the first-person MM3 sheet and combat (class HP,
// Might damage, to-hit vs AC, Speed, Luck). Tactics keeps its own profiles.
export function createChroniclesState(mapId = null, characterBuild = null, { rules = null } = {}) {
  const buildOnly = mapId && typeof mapId === 'object' && !Array.isArray(mapId);
  const requestedMapId = buildOnly ? null : mapId;
  const requestedBuild = buildOnly ? mapId : characterBuild;
  const map = chroniclesMapById(requestedMapId || chroniclesRuntimeEntryMapId());
  return {
    mapId: map.id,
    x: map.partyStart.x,
    y: map.partyStart.y,
    direction: map.partyStart.direction,
    ...chroniclesMapInitialEnemyState(map.id),
    ...map.initialFlags,
    phase: 'explore',
    party: partyState(requestedBuild, rules),
    ...(rules === 'mm3' ? { combatRules: 'mm3' } : {}),
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
  if (Array.isArray(enemy.activationWhen)) return chroniclesRequirementsMet(state, enemy.activationWhen);
  return (enemy.activation || 'always') === 'always';
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
  const runtime = state?.enemyPositions?.[enemy.id];
  if (runtime && Number.isFinite(runtime.x) && Number.isFinite(runtime.y)) return runtime;
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

export function chroniclesEnemyTargetAhead(state, maxReach = 2) {
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

function contentEntryAt(state, group, x, y) {
  const map = chroniclesMapForState(state);
  return (map?.[group] || []).find((entry) => {
    const position = chroniclesMapContentPosition(map, entry);
    return position?.x === x && position?.y === y;
  }) || null;
}

function explorationAction(entry, effects = entry?.action?.effects || []) {
  return {
    effects,
    message: entry?.explorationMessage,
    journal: entry?.explorationJournal,
  };
}

function enterTile(state, x, y) {
  let next = { ...state, x, y, turns: state.turns + 1 };
  const trigger = contentEntryAt(state, 'triggers', x, y);
  if (trigger && chroniclesRequirementsMet(state, trigger.when)) {
    next = chroniclesApplyContentAction(next, explorationAction(trigger), { appendJournal });
  }

  const exit = contentEntryAt(state, 'exits', x, y);
  if (exit && chroniclesRequirementsMet(state, exit.requirements)) {
    const currentMap = chroniclesMapForState(state);
    // Authored settlement gates genuinely enter the next region. Keep the
    // historical dungeon-end contract untouched, so legacy runs/checkpoints
    // do not suddenly switch map or terminal behaviour.
    const route = chroniclesIsOverworldTravelExit(currentMap, exit);
    next = chroniclesApplyContentAction(
      next,
      route ? exit.action : explorationAction(exit, [{ type: 'set', key: 'phase', value: 'escaped' }]),
      { appendJournal },
    );
  }
  return next;
}


export function chroniclesContextualContentAction(state) {
  if (!state || state.phase === 'escaped' || state.phase === 'defeated') return null;
  if (chroniclesSwordhavenReturnAvailable(state)) {
    return { id: CHRONICLES_SWORDHAVEN_RETURN_PORTAL_ID, kind: 'exit', label: 'Regresar a Swordhaven' };
  }
  const map = chroniclesMapForState(state);
  let interaction = chroniclesContentInteractions(
    state,
    map,
    (x, y) => chroniclesTileAt(x, y, state),
  ).find((entry) => !['trigger', 'trap'].includes(entry.kind)
    && (entry.kind !== 'exit' || entry.requiresReturn === true));

  if (!interaction) {
    const front = chroniclesFrontCell(state);
    if (!explorationCellBlocker(state, front.x, front.y)) {
      const definition = (map?.interactables || []).find((entry) => {
        if (!FIRST_PERSON_ADJACENT_INTERACTION_KINDS.has(entry.kind)) return false;
        if (!chroniclesRequirementsMet(state, entry.when)) return false;
        const position = chroniclesMapContentPosition(map, entry);
        return position?.x === front.x && position?.y === front.y;
      });
      if (definition) {
        interaction = {
          id: definition.id,
          kind: definition.kind,
          label: definition.label,
          x: front.x,
          y: front.y,
        };
      }
    }
  }

  if (!interaction) return null;
  const definition = chroniclesContentDefinition(map, interaction.id);
  if (!definition?.action) return null;
  return {
    id: interaction.id,
    kind: interaction.kind,
    label: interaction.label || definition.label || 'Interactuar',
    locked: interaction.locked === true,
  };
}

function resolveContextualContentAction(state) {
  const contextual = chroniclesContextualContentAction(state);
  if (!contextual) return withMessage(state, 'No hay nada útil que manipular aquí. Matthias lo considera una decepción menor.');
  if (contextual.id === CHRONICLES_SWORDHAVEN_RETURN_PORTAL_ID) {
    const arrived = chroniclesApplyContentEffects(state, [{
      type: 'transition-map',
      mapId: 'swordhaven-square',
      entryExitId: 'swordhaven-south-gate',
    }]);
    return {
      ...arrived,
      turns: state.turns + 1,
      message: 'Las escaleras conducen de nuevo al portón de Swordhaven. Matthias exige una parada en la taberna.',
    };
  }
  const map = chroniclesMapForState(state);
  const definition = chroniclesContentDefinition(map, contextual.id);
  // A merchant with a stock list opens its counter instead of a scripted trade.
  if (definition?.shop && Array.isArray(definition.shop.stock)) return chroniclesOpenShop(state, definition);
  if (definition?.guild && Array.isArray(definition.guild.spells)) return chroniclesOpenGuild(state, definition);
  if (!definition?.action) return state;
  if (contextual.locked) {
    const blocked = chroniclesRequirementFailure(state, definition.requirements);
    return withMessage(state, blocked?.message || 'El paso sigue cerrado.');
  }
  const next = chroniclesApplyContentAction(state, definition.action, { appendJournal });
  return next === state ? state : { ...next, turns: state.turns + 1 };
}

function partyMember(state, memberId) {
  return state.party.find((member) => member.id === memberId) || null;
}

export function chroniclesPartyAttackStats(state, memberId) {
  const member = partyMember(state, memberId);
  if (!member) return { damage: 0, reach: 0 };
  const modifiers = state?.rpgModifiers?.[memberId] || {};
  const creator = member.characterBuild?.creatorModifiers || {};
  const persistentDamageBonus = Math.max(
    0,
    Number(modifiers.attackDamageBonus || 0) - Number(creator.attackDamageBonus || 0),
  );
  const persistentReachBonus = Math.max(
    0,
    Number(modifiers.reachBonus || 0) - Number(creator.reachBonus || 0),
  );
  const equipment = chroniclesEquipmentBonuses(state, memberId);
  return {
    damage: Math.max(0, Number(member.damage || 0) + persistentDamageBonus + equipment.attackDamageBonus),
    reach: Math.max(1, Number(member.reach || 1) + persistentReachBonus),
    // MM to-hit: level + Accuracy bonus + weapon (material) to-hit.
    toHit: Math.max(1, Number(modifiers.level || 1))
      + Number(member.mm3?.bonuses?.accuracy || 0)
      + equipment.toHitBonus,
  };
}

// MM armor class: Speed bonus + worn armor (type + material).
export function chroniclesPartyArmorClass(state, memberId) {
  const member = partyMember(state, memberId);
  if (!member) return 0;
  return Math.max(0, Number(member.mm3?.bonuses?.speed || 0) + chroniclesEquipmentBonuses(state, memberId).armorClassBonus);
}

export function chroniclesUsesMM3Combat(state) {
  return state?.combatRules === 'mm3';
}

// One enemy swing at one hero under MM rules: d20 + enemy to-hit vs 10 + AC.
// Armor no longer subtracts damage here; it makes the blow miss.
export function chroniclesMM3EnemySwing(state, enemy, targetId, salt = 'enemy') {
  const roll = chroniclesMM3Roll(state, salt, enemy.id, targetId);
  const hit = chroniclesMM3AttackHits(roll, chroniclesMM3EnemyToHit(enemy), chroniclesPartyArmorClass(state, targetId));
  return { roll, hit, damage: hit ? Math.max(1, Number(enemy.retaliation || 1)) : 0 };
}

function partyDefeated(state) {
  return state.party.length > 0 && state.party.every((member) => member.hp <= 0);
}

function markPartyDefeated(state) {
  if (!partyDefeated(state)) return state;
  return {
    ...state,
    phase: 'defeated',
    message: 'La compañía cae. La cripta, con notable falta de deportividad, permanece en pie.',
  };
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
// `spell` turns the swing into an offensive spell: its own reach and damage
// (after the target's elemental resistance), no to-hit roll, SP already paid.
function resolveAttack(state, memberId, spell = null) {
  const member = partyMember(state, memberId);
  if (!member) return state;
  if (member.hp <= 0) return withMessage(state, `${member.name} está fuera de combate. Incluso la épica tiene límites médicos.`);
  const attacker = spell ? { ...member, attackName: spell.name } : member;

  const weaponStats = chroniclesPartyAttackStats(state, attacker.id);
  const attackStats = spell ? { ...weaponStats, reach: spell.reach } : weaponStats;
  const target = chroniclesEnemyTargetAhead(state, attackStats.reach);
  if (!target) return withMessage(state, `${attacker.name} ejecuta ${attacker.attackName.toLowerCase()} contra absolutamente nada. La nada resiste.`);

  const { enemy, distance } = target;
  if (spell) {
    attackStats.damage = chroniclesSpellDamage(spell, enemy);
    state = chroniclesSpendSp(state, attacker.id, spell.cost);
  } else if (chroniclesUsesMM3Combat(state)) {
    const roll = chroniclesMM3Roll(state, 'party', attacker.id, enemy.id);
    if (!chroniclesMM3AttackHits(roll, attackStats.toHit, chroniclesMM3EnemyArmorClass(enemy))) {
      return {
        ...state,
        turns: state.turns + 1,
        message: `${attacker.name} lanza ${attacker.attackName.toLowerCase()} y falla. ${enemy.name[0].toUpperCase()}${enemy.name.slice(1)} esquiva (d20: ${roll}).`,
      };
    }
  }
  const nextHp = Math.max(0, Number(state[enemy.hpKey] || 0) - attackStats.damage);
  if (nextHp === 0) {
    const defeated = rewardForDefeat({ ...state, [enemy.hpKey]: 0, turns: state.turns + 1, message: defeatMessage(attacker, enemy) }, enemy);
    return journalForDefeat(defeated, attacker, enemy);
  }

  if (state.initiative) {
    return evadeAfterHit({
      ...state,
      [enemy.hpKey]: nextHp,
      turns: state.turns + 1,
      message: `${attacker.name} impacta con ${attacker.attackName.toLowerCase()}. ${enemy.name[0].toUpperCase()}${enemy.name.slice(1)} queda en ${nextHp}/${enemy.maxHp} HP.`,
    }, enemy);
  }

  const retaliationReach = Number(enemy.retaliationReach ?? enemy.ai?.attackReach ?? 1);
  if (distance > retaliationReach) {
    return evadeAfterHit({ ...state, [enemy.hpKey]: nextHp, turns: state.turns + 1, message: rangedHitMessage(attacker, enemy) }, enemy);
  }

  const targetId = retaliationTargetId(state, attacker);
  const previousTarget = state.party.find((member) => member.id === targetId);
  const swing = chroniclesUsesMM3Combat(state) && targetId
    ? chroniclesMM3EnemySwing(state, enemy, targetId, 'retaliation')
    : null;
  const retaliationDamage = (member) => (swing
    ? swing.damage
    : Math.max(0, enemy.retaliation - chroniclesEquipmentBonuses(state, member.id).damageReduction));
  const party = targetId
    ? state.party.map((member) => member.id === targetId
      ? { ...member, hp: Math.max(0, member.hp - retaliationDamage(member)) }
      : member)
    : state.party;
  const retaliationTarget = party.find((member) => member.id === targetId);
  let nextState = {
    ...state,
    [enemy.hpKey]: nextHp,
    party,
    turns: state.turns + 1,
    message: swing && !swing.hit
      ? `${attacker.name} impacta con ${attacker.attackName.toLowerCase()}. ${enemy.name[0].toUpperCase()}${enemy.name.slice(1)} responde, pero ${retaliationTarget?.name || 'su objetivo'} desvía el golpe.`
      : `${attacker.name} impacta con ${attacker.attackName.toLowerCase()}. ${enemy.name[0].toUpperCase()}${enemy.name.slice(1)} responde${retaliationTarget ? ` y alcanza a ${retaliationTarget.name}` : ''}.`,
  };
  if (previousTarget?.hp > 0 && retaliationTarget?.hp === 0) {
    nextState = appendJournal(nextState, {
      id: `down-${retaliationTarget.id}`,
      title: `${retaliationTarget.name} cae`,
      body: `${retaliationTarget.name} queda fuera de combate. Matthias deja un espacio en el margen para comentarios médicamente inapropiados.`,
      sigil: '†',
    });
  }
  return markPartyDefeated(evadeAfterHit(nextState, enemy));
}

function resolveCast(state, memberId, spellId) {
  // A refused cast costs no turn: MM3 simply tells you why.
  const refuse = (message) => ({ ...state, message });
  const caster = partyMember(state, memberId);
  const spell = CHRONICLES_SPELLS[spellId];
  if (!caster || !spell) return state;
  if (caster.hp <= 0) return refuse(`${caster.name} está fuera de combate y no puede conjurar.`);
  if (!chroniclesMemberKnowsSpell(state, caster, spellId)) return refuse(`${caster.name} no conoce ${spell.name}.`);
  if (chroniclesMemberSp(state, caster) < spell.cost) {
    return refuse(`${caster.name} no tiene puntos de hechizo para ${spell.name} (${spell.cost} PH). Descansa en una posada.`);
  }
  if (spell.kind === 'attack') {
    if (!chroniclesEnemyTargetAhead(state, spell.reach)) {
      return refuse(`${caster.name} prepara ${spell.name}, pero no hay ningún enemigo a ${spell.reach} casillas.`);
    }
    const next = resolveAttack(state, memberId, spell);
    const element = CHRONICLES_ELEMENT_LABELS[spell.element];
    return next === state ? state : { ...next, message: `${next.message} (${spell.name}, ${element}: ${spell.cost} PH)` };
  }
  if (spell.kind === 'heal') {
    const patient = chroniclesMostWoundedAlly(state);
    if (!patient) return refuse(`${caster.name} repasa ${spell.name}, pero nadie de la compañía está herido.`);
    const healed = Math.min(patient.maxHp, patient.hp + spell.amount);
    return {
      ...chroniclesSpendSp(state, caster.id, spell.cost),
      party: state.party.map((member) => member.id === patient.id ? { ...member, hp: healed } : member),
      turns: state.turns + 1,
      message: `${caster.name} conjura ${spell.name} sobre ${patient.name}: ${patient.hp} → ${healed} PV.`,
    };
  }
  if (spell.kind === 'detect') {
    const map = chroniclesMapForState(state);
    // Magic senses treasure still sealed, even behind its guardians: a chest
    // counts as opened once the flag its own action sets is already set.
    const opened = (entry) => (entry.action?.effects || [])
      .some((effect) => effect.type === 'set' && state[effect.key] === effect.value);
    const treasures = (map.treasures || [])
      .filter((entry) => (entry.action?.effects || []).some((effect) => effect.type === 'set')
        ? !opened(entry)
        : chroniclesContentVisible(state, entry))
      .map((entry) => chroniclesMapContentPosition(map, entry))
      .filter(Boolean);
    return {
      ...chroniclesSpendSp(state, caster.id, spell.cost),
      turns: state.turns + 1,
      message: chroniclesDetectMagicMessage(caster, treasures, state),
    };
  }
  return state;
}

// MM3-style doors: a town building is a solid block of '#' cells and its
// authored entries (`visualType: building-*`) stand on the street cell in
// front of the door. Walking into that door enters, like interacting; walking
// into any other part of the facade says where the door is.
const wallBlocksByMap = new WeakMap();

function wallBlocks(map) {
  if (wallBlocksByMap.has(map)) return wallBlocksByMap.get(map);
  const grid = map?.grid || [];
  const blockOf = new Map();
  let next = 0;
  grid.forEach((row, y) => [...row].forEach((tile, x) => {
    if (tile !== '#' || blockOf.has(`${x},${y}`)) return;
    const id = next++;
    const queue = [[x, y]];
    const cells = [];
    let touchesEdge = false;
    blockOf.set(`${x},${y}`, id);
    while (queue.length) {
      const [cx, cy] = queue.pop();
      cells.push([cx, cy]);
      if (cx === 0 || cy === 0 || cy === grid.length - 1 || cx === grid[cy].length - 1) touchesEdge = true;
      [[1, 0], [-1, 0], [0, 1], [0, -1]].forEach(([dx, dy]) => {
        const key = `${cx + dx},${cy + dy}`;
        if (grid[cy + dy]?.[cx + dx] === '#' && !blockOf.has(key)) {
          blockOf.set(key, id);
          queue.push([cx + dx, cy + dy]);
        }
      });
    }
    // The town wall is not a building.
    if (touchesEdge) cells.forEach(([cx, cy]) => blockOf.set(`${cx},${cy}`, -1));
  }));
  wallBlocksByMap.set(map, blockOf);
  return blockOf;
}

function buildingDoorsFor(map, x, y) {
  const block = wallBlocks(map).get(`${x},${y}`);
  if (block === undefined || block < 0) return [];
  return (map.interactables || []).filter((entry) => {
    if (!String(entry.visualType || '').startsWith('building-')) return false;
    return [[1, 0], [-1, 0], [0, 1], [0, -1]]
      .some(([dx, dy]) => wallBlocks(map).get(`${entry.x + dx},${entry.y + dy}`) === block);
  });
}

function buildingName(entry) {
  return String(entry?.label || 'el edificio').split(' · ')[0];
}

function stepsWord(count) {
  return count === 1 ? 'un paso' : `${count} pasos`;
}

function bumpIntoBuilding(state, front) {
  const map = chroniclesMapForState(state);
  const doors = buildingDoorsFor(map, front.x, front.y);
  if (!doors.length) return null;
  const here = doors.find((entry) => entry.x === state.x && entry.y === state.y);
  if (here) {
    const contextual = chroniclesContextualContentAction(state);
    if (contextual) return chroniclesAdvanceLostKingIntro(state, resolveContextualContentAction(state));
    return withMessage(state, `${buildingName(here)}: no hay nadie que te atienda ahora mismo.`);
  }
  const door = doors[0];
  const direction = CHRONICLES_DIRECTIONS[state.direction];
  const dx = door.x - state.x;
  const dy = door.y - state.y;
  const lateral = dx * -direction.dy + dy * direction.dx;
  const ahead = dx * direction.dx + dy * direction.dy;
  if (lateral !== 0 && ahead === 0) {
    return withMessage(state, `La puerta de ${buildingName(door)} está ${stepsWord(Math.abs(lateral))} a tu ${lateral > 0 ? 'derecha' : 'izquierda'}.`);
  }
  return withMessage(state, `Es la pared de ${buildingName(door)}. La puerta da a otra calle: rodea el edificio.`);
}

function blockingEnemyMessage(enemy) {
  if (enemy.blockingMessage) return enemy.blockingMessage;
  return `${enemy.name[0].toUpperCase()}${enemy.name.slice(1)} bloquea el paso. Convéncelo con violencia reglamentaria.`;
}

function explorationCellBlocker(state, x, y) {
  const tile = chroniclesTileAt(x, y, state);
  if (tile === '#') {
    return { message: 'Hay una pared. Incluso Matthias concede que atravesarla sería excesivo.' };
  }
  const blockingEnemy = chroniclesEnemyAt(state, x, y);
  if (blockingEnemy) return { message: blockingEnemyMessage(blockingEnemy) };
  const exit = contentEntryAt(state, 'exits', x, y);
  const exitFailure = exit ? chroniclesRequirementFailure(state, exit.requirements) : null;
  if (exitFailure) {
    return {
      message: exitFailure.explorationMessage || exitFailure.message || 'El paso sigue cerrado.',
    };
  }
  return null;
}

export function chroniclesReduce(state, action) {
  if (!state || state.phase === 'escaped' || state.phase === 'defeated') return state;
  const actionType = typeof action === 'string' ? action : action?.type;
  if (actionType === 'shop-buy') return chroniclesShopBuy(state, chroniclesMapForState(state), action.itemId);
  if (actionType === 'shop-sell') return chroniclesShopSell(state, chroniclesMapForState(state), action.itemId);
  if (actionType === 'shop-close') return chroniclesCloseShop(state);
  if (actionType === 'guild-join') return chroniclesGuildJoin(state, chroniclesMapForState(state));
  if (actionType === 'guild-learn') {
    return chroniclesGuildLearn(state, chroniclesMapForState(state), action.memberId, action.spellId);
  }
  if (actionType === 'guild-close') return chroniclesCloseGuild(state);
  // Any other action (moving, turning, fighting) walks away from the counter.
  if ((state.shop || state.guild) && actionType !== 'equip-item' && actionType !== 'unequip-item') {
    return chroniclesReduce(chroniclesCloseGuild(chroniclesCloseShop(state)), action);
  }
  if (actionType === 'equip-item') return chroniclesEquipItem(state, action.memberId, action.itemId);
  if (actionType === 'unequip-item') return chroniclesUnequipItem(state, action.memberId, action.slot);
  if (actionType === 'turn-left') return { ...state, direction: (state.direction + 3) % 4, turns: state.turns + 1 };
  if (actionType === 'turn-right') return { ...state, direction: (state.direction + 1) % 4, turns: state.turns + 1 };
  if (actionType === 'attack') return resolveAttack(state, typeof action === 'object' ? action.memberId : 'matthias');
  if (actionType === 'cast') return resolveCast(state, action.memberId, action.spellId);
  if (actionType === 'interact') return chroniclesAdvanceLostKingIntro(state, resolveContextualContentAction(state));

  const direction = CHRONICLES_DIRECTIONS[state.direction];
  // Lateral steps share the exact same collision, trigger and checkpoint path
  // as forward/backward movement. Strafe never rotates the camera.
  const displacement = {
    forward: [direction.dx, direction.dy],
    backward: [-direction.dx, -direction.dy],
    'strafe-left': [direction.dy, -direction.dx],
    'strafe-right': [-direction.dy, direction.dx],
  }[actionType];
  if (!displacement) return state;
  const x = state.x + displacement[0];
  const y = state.y + displacement[1];
  const blocker = explorationCellBlocker(state, x, y);
  if (blocker && actionType === 'forward') {
    const entered = bumpIntoBuilding(state, { x, y });
    if (entered) return entered;
  }
  if (blocker) return withMessage(state, blocker.message);
  return chroniclesAdvanceLostKingIntro(state, enterTile(state, x, y));
}

export function chroniclesObjective(state) {
  const map = chroniclesMapForState(state);
  if (state.phase === 'defeated') return 'La expedición ha caído';
  if (state.phase === 'escaped') return map.explorationCompleteLabel || 'Exploración completada';

  const requiredEnemy = (map.enemies || []).find((enemy) => !enemy.optional && enemyAlive(state, enemy));
  if (requiredEnemy) return requiredEnemy.explorationObjective || `Derrota a ${requiredEnemy.name}`;

  const pendingTrigger = (map.triggers || []).find((entry) => chroniclesRequirementsMet(state, entry.when));
  if (pendingTrigger) return pendingTrigger.explorationObjective || pendingTrigger.label || 'Activa el siguiente evento';

  const exit = (map.exits || [])[0];
  const exitFailure = exit ? chroniclesRequirementFailure(state, exit.requirements) : null;
  if (exitFailure) {
    const content = [
      ...(map.interactables || []),
      ...(map.treasures || []),
    ];
    const satisfies = (entry, requirement, sourceState = state) => {
      if (!entry?.action?.effects?.length || chroniclesRequirementMet(sourceState, requirement)) return false;
      const simulated = chroniclesApplyContentEffects(sourceState, entry.action.effects);
      return chroniclesRequirementMet(simulated, requirement);
    };
    const available = (entry) => chroniclesRequirementsMet(state, entry.when);

    let pendingInteraction = content.find((entry) => available(entry) && satisfies(entry, exitFailure));

    if (!pendingInteraction) {
      const blockedTargets = content.filter((entry) => satisfies(entry, exitFailure));
      for (const target of blockedTargets) {
        const unmetTargetRequirement = (target.when || []).find(
          (requirement) => !chroniclesRequirementMet(state, requirement),
        );
        if (!unmetTargetRequirement) continue;
        pendingInteraction = content.find(
          (entry) => available(entry) && satisfies(entry, unmetTargetRequirement),
        );
        if (pendingInteraction) break;
      }
    }

    if (pendingInteraction) {
      return pendingInteraction.explorationObjective
        || pendingInteraction.label
        || (pendingInteraction.kind === 'pickup' ? 'Recoge el objeto' : 'Interactúa con el entorno');
    }
  }

  // In the open world the party follows its quests, not the nearest gate.
  // A quest with content on this map wins; otherwise the story thread. An
  // exit objective a designer wrote by hand (legacy Swordhaven) still rules.
  if (['settlement', 'wilderness'].includes(map.regionKind) && !exit?.explorationObjective) {
    const active = chroniclesQuestEntries(state, 'active').filter((quest) => quest.objective);
    const localQuestIds = new Set((map.interactables || []).flatMap((entry) => (
      (entry.when || []).map((requirement) => requirement?.questId).filter(Boolean)
    )));
    const tracked = active.find((quest) => localQuestIds.has(quest.id)) || active[0];
    if (tracked) return tracked.objective;
    // Nothing tracked yet: point at whoever here hands out work.
    const questGiver = (map.interactables || []).find((entry) => chroniclesRequirementsMet(state, entry.when)
      && (entry.action?.effects || []).some((effect) => effect.type === 'start-quest'));
    if (questGiver?.label) return questGiver.label;
  }

  if (exit) return exit.explorationObjective || exit.openLabel || 'Busca una salida';
  return map.explorationIdleObjective || 'Explora la zona';
}

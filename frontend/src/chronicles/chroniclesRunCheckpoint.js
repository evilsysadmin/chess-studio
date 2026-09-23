import {
  chroniclesMapById,
  chroniclesMapIds,
} from './chroniclesMapCatalog.js';

const CONTENT_GROUPS = Object.freeze(['triggers', 'interactables', 'treasures', 'traps', 'exits']);
const RUNTIME_PREFIX = '__chrRuntime.';
const RUNTIME_VERSION = 1;
const RUNTIME_VERSION_KEY = `${RUNTIME_PREFIX}version`;

function authoredSetKeys(map) {
  const contentEffects = CONTENT_GROUPS.flatMap((group) => (
    (map?.[group] || []).flatMap((entry) => entry?.action?.effects || [])
  ));
  const defeatEffects = (map?.enemies || []).flatMap((enemy) => enemy?.onDefeat?.effects || []);
  return [...contentEffects, ...defeatEffects]
    .filter((effect) => effect?.type === 'set' && typeof effect.key === 'string' && effect.key)
    .map((effect) => effect.key);
}

function checkpointFlagKeys() {
  return chroniclesMapIds().flatMap((mapId) => {
    const map = chroniclesMapById(mapId);
    return [
      ...Object.keys(map.initialFlags || {}),
      ...authoredSetKeys(map),
      ...(map.enemies || []).map((enemy) => enemy?.hpKey).filter(Boolean),
    ];
  });
}

function durableFlagValue(value) {
  return value === null || ['boolean', 'number', 'string'].includes(typeof value);
}

function normalizedLedger(values) {
  if (!Array.isArray(values)) return [];
  return [...new Set(values.filter((value) => typeof value === 'string' && value.trim()).map((value) => value.trim()))];
}

function runtimeKey(...parts) {
  return `${RUNTIME_PREFIX}${parts.join('.')}`;
}

function integerOrNull(value, min = 0, max = Number.MAX_SAFE_INTEGER) {
  return Number.isInteger(value) && value >= min && value <= max ? value : null;
}

function shortStringOrNull(value, maxLength = 64) {
  return typeof value === 'string' && value.length > 0 && value.length <= maxLength ? value : null;
}

function runtimeCheckpointFlags(state) {
  const source = state && typeof state === 'object' ? state : {};
  const flags = { [RUNTIME_VERSION_KEY]: RUNTIME_VERSION };

  const x = integerOrNull(source.x);
  const y = integerOrNull(source.y);
  const direction = integerOrNull(source.direction, 0, 3);
  const turns = integerOrNull(source.turns);
  const round = integerOrNull(source.round);
  const phase = shortStringOrNull(source.phase, 32);
  const turnPhase = shortStringOrNull(source.turnPhase, 32);

  if (x !== null) flags[runtimeKey('x')] = x;
  if (y !== null) flags[runtimeKey('y')] = y;
  if (direction !== null) flags[runtimeKey('direction')] = direction;
  if (turns !== null) flags[runtimeKey('turns')] = turns;
  if (round !== null) flags[runtimeKey('round')] = round;
  if (phase !== null) flags[runtimeKey('phase')] = phase;
  if (turnPhase !== null) flags[runtimeKey('turnPhase')] = turnPhase;

  (source.party || []).forEach((member) => {
    const memberId = shortStringOrNull(member?.id, 40);
    const hp = integerOrNull(member?.hp);
    if (memberId && hp !== null) flags[runtimeKey('party', memberId, 'hp')] = hp;
  });

  Object.entries(source.classAbilityCharges || {}).forEach(([memberId, rawCharges]) => {
    const safeMemberId = shortStringOrNull(memberId, 40);
    const charges = integerOrNull(rawCharges, 0, 99);
    if (safeMemberId && charges !== null) flags[runtimeKey('ability', safeMemberId, 'charges')] = charges;
  });

  const map = source.mapId ? chroniclesMapById(source.mapId) : null;
  (map?.enemies || []).forEach((enemy) => {
    const position = source.enemyPositions?.[enemy.id];
    const enemyX = integerOrNull(position?.x);
    const enemyY = integerOrNull(position?.y);
    if (enemyX === null || enemyY === null) return;
    flags[runtimeKey('enemy', enemy.id, 'x')] = enemyX;
    flags[runtimeKey('enemy', enemy.id, 'y')] = enemyY;
  });

  return flags;
}

function authoredWorldFlags(flags) {
  if (!flags || typeof flags !== 'object' || Array.isArray(flags)) return {};
  return Object.fromEntries(
    Object.entries(flags).filter(([key]) => !String(key).startsWith(RUNTIME_PREFIX)),
  );
}

function validWalkablePosition(map, x, y) {
  const row = map?.grid?.[y];
  return typeof row === 'string' && x >= 0 && x < row.length && row[x] !== '#';
}

function applyRuntimeCheckpoint(state, flags) {
  if (!state || !flags || flags[RUNTIME_VERSION_KEY] !== RUNTIME_VERSION) return state;

  const map = chroniclesMapById(state.mapId);
  const x = integerOrNull(flags[runtimeKey('x')]);
  const y = integerOrNull(flags[runtimeKey('y')]);
  const direction = integerOrNull(flags[runtimeKey('direction')], 0, 3);
  const turns = integerOrNull(flags[runtimeKey('turns')]);
  const round = integerOrNull(flags[runtimeKey('round')]);
  const phase = shortStringOrNull(flags[runtimeKey('phase')], 32);
  const turnPhase = shortStringOrNull(flags[runtimeKey('turnPhase')], 32);

  let next = { ...state };
  if (x !== null && y !== null && validWalkablePosition(map, x, y)) {
    next.x = x;
    next.y = y;
  }
  if (direction !== null) next.direction = direction;
  if (turns !== null) next.turns = turns;
  if (round !== null) next.round = round;
  if (phase !== null) next.phase = phase;
  if (turnPhase !== null) next.turnPhase = turnPhase;

  if (Array.isArray(next.party)) {
    next.party = next.party.map((member) => {
      const hp = integerOrNull(flags[runtimeKey('party', member.id, 'hp')]);
      if (hp === null) return member;
      return { ...member, hp: Math.min(Math.max(0, hp), Math.max(0, Number(member.maxHp) || 0)) };
    });
  }

  if (next.classAbilityCharges && typeof next.classAbilityCharges === 'object') {
    const charges = { ...next.classAbilityCharges };
    Object.keys(charges).forEach((memberId) => {
      const restored = integerOrNull(flags[runtimeKey('ability', memberId, 'charges')], 0, 99);
      if (restored !== null) charges[memberId] = restored;
    });
    next.classAbilityCharges = charges;
  }

  const enemyPositions = {
    ...(next.enemyPositions && typeof next.enemyPositions === 'object' ? next.enemyPositions : {}),
  };
  let restoredEnemyPosition = false;
  (map?.enemies || []).forEach((enemy) => {
    const enemyX = integerOrNull(flags[runtimeKey('enemy', enemy.id, 'x')]);
    const enemyY = integerOrNull(flags[runtimeKey('enemy', enemy.id, 'y')]);
    if (enemyX === null || enemyY === null || !validWalkablePosition(map, enemyX, enemyY)) return;
    enemyPositions[enemy.id] = { x: enemyX, y: enemyY };
    restoredEnemyPosition = true;
  });
  if (restoredEnemyPosition) next.enemyPositions = enemyPositions;

  return next;
}

export function chroniclesWorldFlagsForCheckpoint(state) {
  const source = state && typeof state === 'object' ? state : {};
  const authored = Object.fromEntries(
    checkpointFlagKeys()
      .filter((key, index, keys) => keys.indexOf(key) === index)
      .filter((key) => Object.prototype.hasOwnProperty.call(source, key))
      .filter((key) => durableFlagValue(source[key]))
      .map((key) => [key, source[key]]),
  );
  return {
    ...authored,
    ...runtimeCheckpointFlags(source),
  };
}

export function chroniclesRunCheckpointPayload(state, worldVersion) {
  if (!state?.mapId) throw new Error('Chronicles checkpoint requires a current map');
  if (!Number.isInteger(worldVersion) || worldVersion < 0) {
    throw new Error('Chronicles checkpoint requires a non-negative worldVersion');
  }
  return Object.freeze({
    expectedWorldVersion: worldVersion,
    currentMapId: state.mapId,
    worldFlags: chroniclesWorldFlagsForCheckpoint(state),
    consumedContentIds: normalizedLedger(state.consumedContentIds),
    claimedRewards: normalizedLedger(state.claimedRewards),
  });
}

export function chroniclesApplyRunCheckpoint(state, run) {
  if (!state || !run) return state;
  const worldFlags = run.worldFlags || {};
  const durable = {
    ...state,
    ...authoredWorldFlags(worldFlags),
    consumedContentIds: normalizedLedger(run.consumedContentIds),
    claimedRewards: normalizedLedger(run.claimedRewards),
  };
  return applyRuntimeCheckpoint(durable, worldFlags);
}

export function chroniclesRunCheckpointFingerprint(state) {
  if (!state?.mapId) return '';
  const payload = chroniclesRunCheckpointPayload(state, 0);
  return JSON.stringify({
    currentMapId: payload.currentMapId,
    worldFlags: payload.worldFlags,
    consumedContentIds: payload.consumedContentIds,
    claimedRewards: payload.claimedRewards,
  });
}

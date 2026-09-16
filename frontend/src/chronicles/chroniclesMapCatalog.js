import cryptEightSquares from './maps/crypt-eight-squares.json';
import galleryOfForks from './maps/gallery-of-forks.json';
import menagerieOfAsh from './maps/menagerie-of-ash.json';

export const DEFAULT_CHRONICLES_MAP_ID = 'crypt-eight-squares';

const CONTENT_GROUPS = Object.freeze(['triggers', 'interactables', 'treasures', 'traps', 'exits']);
const SUPPORTED_ACTIVATIONS = new Set(['always']);
const SUPPORTED_MOVEMENTS = new Set(['cardinal-chase', 'cardinal-roam', 'knight-chase', 'patrol-route', 'hold']);

function clonePoint(point) {
  return { x: Number(point?.x || 0), y: Number(point?.y || 0) };
}

function freezeRequirements(requirements) {
  return Object.freeze((requirements || []).map((entry) => Object.freeze({ ...entry })));
}

function freezeAction(action) {
  if (!action || typeof action !== 'object') return null;
  return Object.freeze({
    ...action,
    effects: Object.freeze((action.effects || []).map((effect) => Object.freeze({ ...effect }))),
    journal: action.journal ? Object.freeze({ ...action.journal }) : undefined,
  });
}

function normalizeContentEntry(entry) {
  return Object.freeze({
    ...entry,
    x: entry?.x === undefined ? undefined : Number(entry.x),
    y: entry?.y === undefined ? undefined : Number(entry.y),
    when: freezeRequirements(entry?.when),
    requirements: freezeRequirements(entry?.requirements),
    action: freezeAction(entry?.action),
  });
}

function normalizeEnemy(enemy) {
  const positions = enemy?.positions && typeof enemy.positions === 'object'
    ? Object.fromEntries(Object.entries(enemy.positions).map(([key, point]) => [key, clonePoint(point)]))
    : undefined;
  return Object.freeze({
    ...enemy,
    x: Number(enemy?.x || 0),
    y: Number(enemy?.y || 0),
    maxHp: Math.max(1, Number(enemy?.maxHp || 1)),
    retaliation: Math.max(0, Number(enemy?.retaliation || 0)),
    retaliationReach: Math.max(1, Number(enemy?.retaliationReach ?? enemy?.ai?.attackReach ?? 1)),
    activationWhen: Array.isArray(enemy?.activationWhen) ? freezeRequirements(enemy.activationWhen) : undefined,
    positions: positions ? Object.freeze(positions) : undefined,
    ai: Object.freeze({
      movement: enemy?.ai?.movement || 'cardinal-chase',
      engagedMovement: enemy?.ai?.engagedMovement || undefined,
      engageRange: Number.isFinite(Number(enemy?.ai?.engageRange))
        ? Math.max(1, Number(enemy.ai.engageRange))
        : undefined,
      attackReach: Math.max(1, Number(enemy?.ai?.attackReach ?? enemy?.retaliationReach ?? 1)),
      requiresLineOfSight: Boolean(enemy?.ai?.requiresLineOfSight),
      patrolRoute: Object.freeze((enemy?.ai?.patrolRoute || []).map((point) => Object.freeze(clonePoint(point)))),
    }),
    onDefeat: enemy?.onDefeat ? Object.freeze({
      ...enemy.onDefeat,
      effects: Object.freeze((enemy.onDefeat.effects || []).map((effect) => Object.freeze({ ...effect }))),
    }) : undefined,
  });
}

function assertUnique(mapId, label, values) {
  const seen = new Set();
  values.forEach((value) => {
    if (!value) throw new Error(`Chronicles map ${mapId} requires ${label}`);
    if (seen.has(value)) throw new Error(`Chronicles map ${mapId} has duplicate ${label}: ${value}`);
    seen.add(value);
  });
}

function assertWalkablePoint(map, point, label) {
  if (!Number.isInteger(point?.x) || !Number.isInteger(point?.y)) {
    throw new Error(`Chronicles map ${map.id} ${label} requires integer coordinates`);
  }
  const row = map.grid[point.y];
  if (!row || point.x < 0 || point.x >= row.length) {
    throw new Error(`Chronicles map ${map.id} ${label} is outside the grid`);
  }
  if (row[point.x] === '#') {
    throw new Error(`Chronicles map ${map.id} ${label} cannot occupy a wall`);
  }
}

function mapContentEntries(map) {
  return CONTENT_GROUPS.flatMap((group) => (map[group] || []).map((entry) => ({ group, entry })));
}

function assertContentLocation(map, group, entry) {
  const hasX = Number.isFinite(entry.x);
  const hasY = Number.isFinite(entry.y);
  if (hasX !== hasY) {
    throw new Error(`Chronicles map ${map.id} ${group} ${entry.id} requires both x and y`);
  }
  if (hasX && hasY) {
    assertWalkablePoint(map, entry, `${group} ${entry.id}`);
    return;
  }
  if (typeof entry.tile !== 'string' || entry.tile.length !== 1) {
    throw new Error(`Chronicles map ${map.id} ${group} ${entry.id} requires coordinates or a single tile marker`);
  }
  if (!map.grid.some((row) => row.includes(entry.tile))) {
    throw new Error(`Chronicles map ${map.id} ${group} ${entry.id} references missing tile ${entry.tile}`);
  }
}

function assertPatrolRoute(map, enemy) {
  if ((enemy.ai?.movement || 'cardinal-chase') !== 'patrol-route') return;
  const route = enemy.ai?.patrolRoute || [];
  if (route.length < 2) {
    throw new Error(`Chronicles map ${map.id} enemy ${enemy.id} patrol-route requires at least two patrolRoute points`);
  }
  route.forEach((point, index) => assertWalkablePoint(map, point, `enemy ${enemy.id} patrolRoute[${index}]`));
  const spawnIndex = route.findIndex((point) => point.x === enemy.x && point.y === enemy.y);
  if (spawnIndex < 0) {
    throw new Error(`Chronicles map ${map.id} enemy ${enemy.id} patrolRoute must include its spawn`);
  }
  route.forEach((point, index) => {
    const next = route[(index + 1) % route.length];
    const separation = Math.abs(point.x - next.x) + Math.abs(point.y - next.y);
    if (separation !== 1) {
      throw new Error(`Chronicles map ${map.id} enemy ${enemy.id} patrolRoute steps must be cardinal-adjacent`);
    }
  });
}

function assertEnemyContract(map, enemy) {
  assertWalkablePoint(map, enemy, `enemy ${enemy.id}`);
  if (!enemy.hpKey || typeof enemy.hpKey !== 'string') {
    throw new Error(`Chronicles map ${map.id} enemy ${enemy.id} requires hpKey`);
  }
  if (!SUPPORTED_ACTIVATIONS.has(enemy.activation || 'always')) {
    throw new Error(`Chronicles map ${map.id} enemy ${enemy.id} uses unsupported activation ${enemy.activation}`);
  }
  if (!SUPPORTED_MOVEMENTS.has(enemy.ai?.movement || 'cardinal-chase')) {
    throw new Error(`Chronicles map ${map.id} enemy ${enemy.id} uses unsupported movement ${enemy.ai?.movement}`);
  }
  if (enemy.ai?.engagedMovement && !SUPPORTED_MOVEMENTS.has(enemy.ai.engagedMovement)) {
    throw new Error(`Chronicles map ${map.id} enemy ${enemy.id} uses unsupported engagedMovement ${enemy.ai.engagedMovement}`);
  }
  if (enemy.ai?.engagedMovement && !Number.isFinite(enemy.ai?.engageRange)) {
    throw new Error(`Chronicles map ${map.id} enemy ${enemy.id} engagedMovement requires engageRange`);
  }
  if (!enemy.ai?.engagedMovement && Number.isFinite(enemy.ai?.engageRange)) {
    throw new Error(`Chronicles map ${map.id} enemy ${enemy.id} engageRange requires engagedMovement`);
  }
  assertPatrolRoute(map, enemy);

  if (enemy.positionKey) {
    const positionEntries = Object.entries(enemy.positions || {});
    if (!positionEntries.length) {
      throw new Error(`Chronicles map ${map.id} enemy ${enemy.id} positionKey requires positions`);
    }
    if (!enemy.initialPosition || !enemy.positions?.[enemy.initialPosition]) {
      throw new Error(`Chronicles map ${map.id} enemy ${enemy.id} requires a valid initialPosition`);
    }
    positionEntries.forEach(([key, point]) => assertWalkablePoint(map, point, `enemy ${enemy.id} position ${key}`));
  } else if (enemy.positions || enemy.initialPosition) {
    throw new Error(`Chronicles map ${map.id} enemy ${enemy.id} positions require positionKey`);
  }
}

function assertMapContract(map) {
  assertWalkablePoint(map, map.partyStart, 'partyStart');
  if (!Number.isInteger(map.partyStart.direction) || map.partyStart.direction < 0 || map.partyStart.direction > 3) {
    throw new Error(`Chronicles map ${map.id} partyStart direction must be 0..3`);
  }

  assertUnique(map.id, 'enemy id', map.enemies.map((enemy) => enemy.id));
  assertUnique(map.id, 'enemy hpKey', map.enemies.map((enemy) => enemy.hpKey));
  map.enemies.forEach((enemy) => assertEnemyContract(map, enemy));

  const content = mapContentEntries(map);
  assertUnique(map.id, 'content id', content.map(({ entry }) => entry.id));
  content.forEach(({ group, entry }) => {
    assertContentLocation(map, group, entry);
    if (!entry.action || typeof entry.action !== 'object') {
      throw new Error(`Chronicles map ${map.id} ${group} ${entry.id} requires an action`);
    }
  });
}

function transitionEffects(map) {
  return [
    ...mapContentEntries(map).flatMap(({ entry }) => entry.action?.effects || []),
    ...map.enemies.flatMap((enemy) => enemy.onDefeat?.effects || []),
  ].filter((effect) => effect?.type === 'transition-map');
}

function assertKnownTransitions(map, knownMapIds) {
  transitionEffects(map).forEach((effect) => {
    if (!effect.mapId || !knownMapIds.has(effect.mapId)) {
      throw new Error(`Chronicles map ${map.id} transitions to unknown map ${effect.mapId || '<missing>'}`);
    }
  });
}

function normalizeMap(source) {
  if (!source?.id || !Array.isArray(source.grid) || source.grid.length === 0) {
    throw new Error('Chronicles map requires id and grid');
  }
  const width = source.grid[0].length;
  if (!width || source.grid.some((row) => typeof row !== 'string' || row.length !== width)) {
    throw new Error(`Chronicles map ${source.id} must use a rectangular string grid`);
  }

  const map = {
    ...source,
    grid: Object.freeze([...source.grid]),
    partyStart: Object.freeze({
      x: Number(source.partyStart?.x || 0),
      y: Number(source.partyStart?.y || 0),
      direction: Number(source.partyStart?.direction || 0),
    }),
    initialFlags: Object.freeze({ ...(source.initialFlags || {}) }),
    enemies: Object.freeze((source.enemies || []).map(normalizeEnemy)),
    triggers: Object.freeze((source.triggers || []).map(normalizeContentEntry)),
    interactables: Object.freeze((source.interactables || []).map(normalizeContentEntry)),
    treasures: Object.freeze((source.treasures || []).map(normalizeContentEntry)),
    traps: Object.freeze((source.traps || []).map(normalizeContentEntry)),
    exits: Object.freeze((source.exits || []).map(normalizeContentEntry)),
    initialJournal: Object.freeze({ ...(source.initialJournal || {}) }),
  };
  assertMapContract(map);
  return Object.freeze(map);
}

export function chroniclesValidateMapDefinition(source, knownMapIds = null) {
  const map = normalizeMap(source);
  if (knownMapIds) assertKnownTransitions(map, new Set(knownMapIds));
  return map;
}

const MAPS = Object.freeze({
  [DEFAULT_CHRONICLES_MAP_ID]: normalizeMap(cryptEightSquares),
  [galleryOfForks.id]: normalizeMap(galleryOfForks),
  [menagerieOfAsh.id]: normalizeMap(menagerieOfAsh),
});

const MAP_IDS = new Set(Object.keys(MAPS));
const RUNTIME_MAPS = new Map();
Object.values(MAPS).forEach((map) => assertKnownTransitions(map, MAP_IDS));

export function chroniclesInstallRuntimeMapDefinition(source) {
  if (!MAP_IDS.has(source?.id)) {
    throw new Error(`Chronicles runtime map ${source?.id || '<missing>'} has no bundled fallback`);
  }
  const map = chroniclesValidateMapDefinition(source, MAP_IDS);
  RUNTIME_MAPS.set(map.id, map);
  return map;
}

export function chroniclesClearRuntimeMapDefinitions() {
  RUNTIME_MAPS.clear();
}

export function chroniclesMapById(mapId = DEFAULT_CHRONICLES_MAP_ID) {
  return RUNTIME_MAPS.get(mapId) || MAPS[mapId] || RUNTIME_MAPS.get(DEFAULT_CHRONICLES_MAP_ID) || MAPS[DEFAULT_CHRONICLES_MAP_ID];
}

export function chroniclesMapForState(state) {
  return chroniclesMapById(state?.mapId);
}

export function chroniclesMapTileAt(mapOrState, x, y) {
  const map = mapOrState?.grid ? mapOrState : chroniclesMapForState(mapOrState);
  return map.grid[y]?.[x] || '#';
}

export function chroniclesMapEnemyById(mapOrState, enemyId) {
  const map = mapOrState?.grid ? mapOrState : chroniclesMapForState(mapOrState);
  return map.enemies.find((enemy) => enemy.id === enemyId) || null;
}

export function chroniclesMapInteractable(mapOrState, id) {
  const map = mapOrState?.grid ? mapOrState : chroniclesMapForState(mapOrState);
  return map.interactables.find((entry) => entry.id === id) || null;
}

export function chroniclesMapInitialEnemyState(mapId = DEFAULT_CHRONICLES_MAP_ID) {
  const map = chroniclesMapById(mapId);
  return map.enemies.reduce((state, enemy) => {
    state[enemy.hpKey] = enemy.maxHp;
    if (enemy.positionKey && enemy.initialPosition) state[enemy.positionKey] = enemy.initialPosition;
    return state;
  }, {});
}

function clearedEnemyState(map) {
  return (map?.enemies || []).reduce((state, enemy) => {
    state[enemy.hpKey] = 0;
    if (enemy.positionKey) state[enemy.positionKey] = undefined;
    return state;
  }, {});
}

export function chroniclesMapTransitionState(state, mapId) {
  const previousMap = chroniclesMapForState(state);
  const map = chroniclesMapById(mapId);
  return {
    ...state,
    ...clearedEnemyState(previousMap),
    mapId: map.id,
    x: map.partyStart.x,
    y: map.partyStart.y,
    direction: map.partyStart.direction,
    ...chroniclesMapInitialEnemyState(map.id),
    ...map.initialFlags,
    phase: 'explore',
    enemyPositions: {},
    enemyTurnEvents: [],
  };
}

export function chroniclesMapContentPosition(mapOrState, entry) {
  const map = mapOrState?.grid ? mapOrState : chroniclesMapForState(mapOrState);
  if (!entry) return null;
  if (Number.isFinite(entry.x) && Number.isFinite(entry.y)) return { x: entry.x, y: entry.y };
  if (!entry.tile) return null;
  for (let y = 0; y < map.grid.length; y += 1) {
    const x = map.grid[y].indexOf(entry.tile);
    if (x >= 0) return { x, y };
  }
  return null;
}

function chroniclesMapRenderContent(map) {
  return Object.freeze(mapContentEntries(map).map(({ group, entry }) => {
    const position = chroniclesMapContentPosition(map, entry);
    return Object.freeze({
      id: entry.id,
      kind: entry.kind,
      group,
      visualType: entry.visualType || entry.kind,
      position: position ? Object.freeze(position) : null,
    });
  }));
}

export function chroniclesMapRenderPlan(mapOrState = null) {
  const map = mapOrState?.grid ? mapOrState : chroniclesMapForState(mapOrState);
  const content = chroniclesMapRenderContent(map);
  const legacyProp = (kind) => {
    const entry = content.find((candidate) => candidate.kind === kind) || null;
    return entry ? Object.freeze({ id: entry.id, position: entry.position }) : null;
  };
  return Object.freeze({
    mapId: map.id,
    title: map.title,
    grid: map.grid,
    width: map.grid[0]?.length || 0,
    height: map.grid.length,
    enemies: Object.freeze(map.enemies.map((enemy) => Object.freeze({
      id: enemy.id,
      visualType: enemy.visualType || enemy.id,
      visualScale: Number.isFinite(Number(enemy.visualScale)) ? Number(enemy.visualScale) : 1,
      visualMotion: enemy.visualMotion || 'grounded',
    }))),
    content,
    // Compatibility aliases for the current isometric renderer. New renderers
    // should consume content so multiple authored props of the same kind work.
    lever: legacyProp('lever'),
    pickup: legacyProp('pickup'),
    sigil: legacyProp('trigger'),
  });
}

export function chroniclesMapIds() {
  return Object.keys(MAPS);
}

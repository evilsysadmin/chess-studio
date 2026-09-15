import cryptEightSquares from './maps/crypt-eight-squares.json';
import galleryOfForks from './maps/gallery-of-forks.json';

export const DEFAULT_CHRONICLES_MAP_ID = 'crypt-eight-squares';

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
    positions: positions ? Object.freeze(positions) : undefined,
    ai: Object.freeze({
      movement: enemy?.ai?.movement || 'cardinal-chase',
      attackReach: Math.max(1, Number(enemy?.ai?.attackReach ?? enemy?.retaliationReach ?? 1)),
      requiresLineOfSight: Boolean(enemy?.ai?.requiresLineOfSight),
    }),
    onDefeat: enemy?.onDefeat ? Object.freeze({
      ...enemy.onDefeat,
      effects: Object.freeze((enemy.onDefeat.effects || []).map((effect) => Object.freeze({ ...effect }))),
    }) : undefined,
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

  return Object.freeze({
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
  });
}

const MAPS = Object.freeze({
  [DEFAULT_CHRONICLES_MAP_ID]: normalizeMap(cryptEightSquares),
  [galleryOfForks.id]: normalizeMap(galleryOfForks),
});

export function chroniclesMapById(mapId = DEFAULT_CHRONICLES_MAP_ID) {
  return MAPS[mapId] || MAPS[DEFAULT_CHRONICLES_MAP_ID];
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

export function chroniclesMapRenderPlan(mapOrState = null) {
  const map = mapOrState?.grid ? mapOrState : chroniclesMapForState(mapOrState);
  const lever = map.interactables.find((entry) => entry.kind === 'lever') || null;
  const pickup = map.treasures.find((entry) => entry.kind === 'pickup') || null;
  const sigil = map.triggers.find((entry) => entry.kind === 'trigger') || null;
  return Object.freeze({
    mapId: map.id,
    title: map.title,
    grid: map.grid,
    width: map.grid[0]?.length || 0,
    height: map.grid.length,
    enemies: Object.freeze(map.enemies.map((enemy) => Object.freeze({
      id: enemy.id,
      visualType: enemy.visualType || enemy.id,
    }))),
    lever: lever ? Object.freeze({ id: lever.id, position: chroniclesMapContentPosition(map, lever) }) : null,
    pickup: pickup ? Object.freeze({ id: pickup.id, position: chroniclesMapContentPosition(map, pickup) }) : null,
    sigil: sigil ? Object.freeze({ id: sigil.id, position: chroniclesMapContentPosition(map, sigil) }) : null,
  });
}

export function chroniclesMapIds() {
  return Object.keys(MAPS);
}

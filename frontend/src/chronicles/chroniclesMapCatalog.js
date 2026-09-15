import cryptEightSquares from './maps/crypt-eight-squares.json';

export const DEFAULT_CHRONICLES_MAP_ID = 'crypt-eight-squares';

function clonePoint(point) {
  return { x: Number(point?.x || 0), y: Number(point?.y || 0) };
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
    interactables: Object.freeze((source.interactables || []).map((entry) => Object.freeze({ ...entry }))),
    treasures: Object.freeze((source.treasures || []).map((entry) => Object.freeze({ ...entry }))),
    traps: Object.freeze((source.traps || []).map((entry) => Object.freeze({ ...entry }))),
    initialJournal: Object.freeze({ ...(source.initialJournal || {}) }),
  });
}

const MAPS = Object.freeze({
  [DEFAULT_CHRONICLES_MAP_ID]: normalizeMap(cryptEightSquares),
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

export function chroniclesMapIds() {
  return Object.keys(MAPS);
}

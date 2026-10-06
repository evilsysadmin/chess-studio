import {
  STORAGE_SESSION,
  readJsonStorage,
  removeStorageItem,
  writeJsonStorage,
} from '../safeStorage.js';

const AUTOMAP_STORAGE_PREFIX = 'chess-study-chronicles-automap-v1:';

const CARDINAL_NEIGHBORS = Object.freeze([
  Object.freeze({ dx: 0, dy: 0 }),
  Object.freeze({ dx: 0, dy: -1 }),
  Object.freeze({ dx: 1, dy: 0 }),
  Object.freeze({ dx: 0, dy: 1 }),
  Object.freeze({ dx: -1, dy: 0 }),
]);

export function chroniclesAutomapCellKey(x, y) {
  return `${Number(x)}:${Number(y)}`;
}

function parseCellKey(key) {
  const [rawX, rawY] = String(key || '').split(':');
  const x = Number(rawX);
  const y = Number(rawY);
  return Number.isInteger(x) && Number.isInteger(y) ? { x, y } : null;
}

export function chroniclesAutomapMarkVisited(visitedByMap, state) {
  if (!state?.mapId || !Number.isInteger(state.x) || !Number.isInteger(state.y)) {
    return visitedByMap || {};
  }

  const source = visitedByMap && typeof visitedByMap === 'object' ? visitedByMap : {};
  const visited = Array.isArray(source[state.mapId]) ? source[state.mapId] : [];
  const key = chroniclesAutomapCellKey(state.x, state.y);
  if (visited.includes(key)) return source;

  return {
    ...source,
    [state.mapId]: [...visited, key],
  };
}

export function chroniclesAutomapRevealedCells(map, visitedCells) {
  const revealed = new Set();
  const width = Number(map?.grid?.[0]?.length || 0);
  const height = Number(map?.grid?.length || 0);
  if (!width || !height) return revealed;

  (Array.isArray(visitedCells) ? visitedCells : []).forEach((key) => {
    const cell = parseCellKey(key);
    if (!cell) return;
    CARDINAL_NEIGHBORS.forEach(({ dx, dy }) => {
      const x = cell.x + dx;
      const y = cell.y + dy;
      if (x < 0 || y < 0 || x >= width || y >= height) return;
      revealed.add(chroniclesAutomapCellKey(x, y));
    });
  });

  return revealed;
}


export function chroniclesAutomapLocalVisibleCells(map, state, radius = 3) {
  const visible = new Set();
  const width = Number(map?.grid?.[0]?.length || 0);
  const height = Number(map?.grid?.length || 0);
  const startX = Number(state?.x);
  const startY = Number(state?.y);
  const safeRadius = Math.max(0, Math.min(8, Math.trunc(Number(radius) || 0)));
  if (
    !width
    || !height
    || !Number.isInteger(startX)
    || !Number.isInteger(startY)
    || startX < 0
    || startY < 0
    || startX >= width
    || startY >= height
  ) return visible;

  const queue = [{ x: startX, y: startY, distance: 0 }];
  const traversed = new Set([chroniclesAutomapCellKey(startX, startY)]);

  while (queue.length) {
    const current = queue.shift();
    visible.add(chroniclesAutomapCellKey(current.x, current.y));
    if (current.distance >= safeRadius) continue;

    CARDINAL_NEIGHBORS.slice(1).forEach(({ dx, dy }) => {
      const x = current.x + dx;
      const y = current.y + dy;
      if (x < 0 || y < 0 || x >= width || y >= height) return;
      const key = chroniclesAutomapCellKey(x, y);
      visible.add(key);
      if (map.grid[y]?.[x] === '#' || traversed.has(key)) return;
      traversed.add(key);
      queue.push({ x, y, distance: current.distance + 1 });
    });
  }

  return visible;
}

export function chroniclesAutomapFacingDegrees(direction) {
  const numeric = Number.isFinite(Number(direction)) ? Number(direction) : 0;
  const normalized = ((Math.trunc(numeric) % 4) + 4) % 4;
  return normalized * 90;
}


function automapStorageKey(runId) {
  const safeRunId = typeof runId === 'string' ? runId.trim() : '';
  return safeRunId ? `${AUTOMAP_STORAGE_PREFIX}${safeRunId}` : '';
}

function normalizeVisitedLedger(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value).flatMap(([mapId, cells]) => {
      if (typeof mapId !== 'string' || !mapId || !Array.isArray(cells)) return [];
      const normalized = [...new Set(
        cells
          .filter((cell) => /^-?\d+:-?\d+$/.test(String(cell)))
          .map(String),
      )].slice(0, 4096);
      return normalized.length ? [[mapId, normalized]] : [];
    }),
  );
}

export function loadChroniclesAutomapVisited(runId) {
  const key = automapStorageKey(runId);
  if (!key) return {};
  return normalizeVisitedLedger(readJsonStorage(STORAGE_SESSION, key, {
    fallback: {},
    removeMalformed: true,
  }));
}

export function saveChroniclesAutomapVisited(runId, visitedByMap) {
  const key = automapStorageKey(runId);
  if (!key) return false;
  return writeJsonStorage(STORAGE_SESSION, key, normalizeVisitedLedger(visitedByMap));
}

export function clearChroniclesAutomapVisited(runId) {
  const key = automapStorageKey(runId);
  if (!key) return false;
  return removeStorageItem(STORAGE_SESSION, key);
}

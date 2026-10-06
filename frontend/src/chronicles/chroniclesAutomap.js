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

import {
  STORAGE_SESSION,
  readJsonStorage,
  removeStorageItem,
  writeJsonStorage,
} from '../safeStorage.js';

const AUTOMAP_STORAGE_PREFIX = 'chess-study-chronicles-automap-v1:';

// N/E/S/W follow the same orientation as the first-person camera.
const FACING_VECTORS = Object.freeze([
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

// The automap remembers only geometry that entered the camera's field of view.
// Seen-but-unvisited floors AND walls use `x:y:s`, preserving the walked route
// separately and preventing unseen corners from leaking into the map.
const SEEN_SUFFIX = ':s';

export function chroniclesAutomapMarkSeen(visitedByMap, map, state, radius = 3) {
  const marked = chroniclesAutomapMarkVisited(visitedByMap, state);
  if (!map?.grid || !state?.mapId) return marked;
  const visited = Array.isArray(marked[state.mapId]) ? marked[state.mapId] : [];
  const known = new Set(visited.map((key) => String(key).replace(SEEN_SUFFIX, '')));
  const seen = [...chroniclesAutomapLocalVisibleCells(map, state, radius)].filter((key) => {
    const cell = parseCellKey(key);
    return cell && !known.has(key);
  }).map((key) => `${key}${SEEN_SUFFIX}`);
  if (!seen.length) return marked;
  return { ...marked, [state.mapId]: [...visited, ...seen] };
}

export function chroniclesAutomapRevealedCells(map, visitedCells) {
  const revealed = new Set();
  const width = Number(map?.grid?.[0]?.length || 0);
  const height = Number(map?.grid?.length || 0);
  if (!width || !height) return revealed;

  // Previously, every recorded tile implicitly exposed its four neighbors.
  // That revealed passages behind corners even when the party had never seen
  // them. Explicit sight and footsteps are now the only sources of knowledge.
  (Array.isArray(visitedCells) ? visitedCells : []).forEach((key) => {
    const cell = parseCellKey(key);
    if (cell && cell.x >= 0 && cell.y >= 0 && cell.x < width && cell.y < height) {
      revealed.add(chroniclesAutomapCellKey(cell.x, cell.y));
    }
  });
  return revealed;
}

// Cast a ray from the centers of two cells, stopping at the first opaque tile.
// At exact diagonal corners, the side cells must both be clear: an angled
// glimpse cannot slip through the join between two pieces of masonry.
function chroniclesAutomapClearSight(map, startX, startY, targetX, targetY) {
  const dx = targetX - startX;
  const dy = targetY - startY;
  const stepX = Math.sign(dx);
  const stepY = Math.sign(dy);
  const deltaX = dx ? 1 / Math.abs(dx) : Infinity;
  const deltaY = dy ? 1 / Math.abs(dy) : Infinity;
  let nextX = deltaX / 2;
  let nextY = deltaY / 2;
  let x = startX;
  let y = startY;
  const opaque = (col, row) => map.grid[row]?.[col] === '#' || map.grid[row]?.[col] === undefined;

  while (x !== targetX || y !== targetY) {
    if (nextX + 1e-9 < nextY) {
      x += stepX;
      nextX += deltaX;
    } else if (nextY + 1e-9 < nextX) {
      y += stepY;
      nextY += deltaY;
    } else {
      if (opaque(x + stepX, y) || opaque(x, y + stepY)) return false;
      x += stepX;
      y += stepY;
      nextX += deltaX;
      nextY += deltaY;
    }
    if (opaque(x, y) && (x !== targetX || y !== targetY)) return false;
  }
  return true;
}

export function chroniclesAutomapLocalVisibleCells(map, state, radius = 3) {
  const visible = new Set();
  const width = Number(map?.grid?.[0]?.length || 0);
  const height = Number(map?.grid?.length || 0);
  const startX = Number(state?.x);
  const startY = Number(state?.y);
  const safeRadius = Math.max(0, Math.min(8, Math.trunc(Number(radius) || 0)));
  if (
    !width || !height
    || !Number.isInteger(startX) || !Number.isInteger(startY)
    || startX < 0 || startY < 0 || startX >= width || startY >= height
  ) return visible;

  // Conservative 90° forward field of view (inside the 3D camera's 96°
  // maximum horizontal FOV). Turns expose new geometry without leaking bends.
  const direction = ((Math.trunc(Number(state?.direction) || 0) % 4) + 4) % 4;
  const facing = FACING_VECTORS[direction];
  for (let y = Math.max(0, startY - safeRadius); y <= Math.min(height - 1, startY + safeRadius); y += 1) {
    for (let x = Math.max(0, startX - safeRadius); x <= Math.min(width - 1, startX + safeRadius); x += 1) {
      const dx = x - startX;
      const dy = y - startY;
      const distance = Math.hypot(dx, dy);
      if (distance > safeRadius) continue;
      if (distance && (dx * facing.dx + dy * facing.dy) / distance < Math.SQRT1_2) continue;
      if (chroniclesAutomapClearSight(map, startX, startY, x, y)) {
        visible.add(chroniclesAutomapCellKey(x, y));
      }
    }
  }
  return visible;
}

// MM3-style position inside the current map: X grows east, Y grows north
// (0,0 is the south-west corner), so «X9 Y7» reads the way the old games did.
export function chroniclesMapCoordinates(map, state) {
  const height = Number(map?.grid?.length || 0);
  if (!height || !Number.isInteger(state?.x) || !Number.isInteger(state?.y)) return null;
  return { x: state.x, y: height - 1 - state.y };
}

export function chroniclesMapCoordinatesLabel(map, state) {
  const coords = chroniclesMapCoordinates(map, state);
  return coords ? `X${coords.x} Y${coords.y}` : '';
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
          .filter((cell) => /^-?\d+:-?\d+(:s)?$/.test(String(cell)))
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

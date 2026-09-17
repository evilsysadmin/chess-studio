import {
  CHRONICLES_DIRECTIONS,
  chroniclesEnemyIsActive,
  chroniclesEnemyPosition,
  chroniclesTileAt,
} from './chroniclesOfMatthias.js';
import { chroniclesEnemyRenderRoster } from './chroniclesEnemyRenderRoster.js';
import { chroniclesContentVisualStates } from './chronicles/chroniclesContentVisualState.js';

export const CHRONICLES_PARTY_GRID_ORDER = Object.freeze(['matthias', 'rook', 'bishop', 'knight']);

const MAX_DEPLOY_RADIUS = 6;
const MAX_DEPLOY_CANDIDATES = 24;
const PARTY_ROLE_TARGETS = Object.freeze({
  matthias: Object.freeze({ forward: 0.7, left: 0.7 }),
  rook: Object.freeze({ forward: 0.7, left: -0.7 }),
  bishop: Object.freeze({ forward: -0.7, left: 0.7 }),
  knight: Object.freeze({ forward: -0.7, left: -0.7 }),
});

function cellKey({ x, y }) {
  return `${x}:${y}`;
}

function manhattan(a, b) {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}

function formationBasis(directionIndex) {
  const forward = CHRONICLES_DIRECTIONS[directionIndex] || CHRONICLES_DIRECTIONS[1];
  return Object.freeze({
    forward,
    left: Object.freeze({ dx: forward.dy, dy: -forward.dx }),
  });
}

function runtimeEnemyPosition(state, enemy) {
  const runtime = state?.enemyPositions?.[enemy.id];
  if (runtime && Number.isFinite(runtime.x) && Number.isFinite(runtime.y)) return runtime;
  return chroniclesEnemyPosition(state, enemy);
}

function occupiedCells(state) {
  const occupied = new Set();

  chroniclesEnemyRenderRoster(state).forEach(({ definition }) => {
    const active = chroniclesEnemyIsActive(state, definition) && Number(state?.[definition.hpKey] || 0) > 0;
    if (active) occupied.add(cellKey(runtimeEnemyPosition(state, definition)));
  });

  chroniclesContentVisualStates(state).forEach((entry) => {
    if (entry.visible && entry.position) occupied.add(cellKey(entry.position));
  });

  return occupied;
}

function deployableCell(state, cell, occupied) {
  const tile = chroniclesTileAt(cell.x, cell.y, state);
  return Boolean(tile && tile !== '#' && !occupied.has(cellKey(cell)));
}

function deployCandidates(state, origin, occupied, basis) {
  const candidates = [];
  for (let radius = 0; radius <= MAX_DEPLOY_RADIUS; radius += 1) {
    for (let dx = -radius; dx <= radius; dx += 1) {
      const dyMagnitude = radius - Math.abs(dx);
      const dys = dyMagnitude === 0 ? [0] : [-dyMagnitude, dyMagnitude];
      dys.forEach((dy) => {
        const cell = { x: origin.x + dx, y: origin.y + dy };
        if (!deployableCell(state, cell, occupied)) return;
        const localForward = dx * basis.forward.dx + dy * basis.forward.dy;
        const localLeft = dx * basis.left.dx + dy * basis.left.dy;
        candidates.push(Object.freeze({
          x: cell.x,
          y: cell.y,
          distance: radius,
          localForward,
          localLeft,
        }));
      });
    }
  }

  return candidates
    .sort((a, b) => (
      a.distance - b.distance
      || b.localForward - a.localForward
      || b.localLeft - a.localLeft
      || a.y - b.y
      || a.x - b.x
    ))
    .slice(0, MAX_DEPLOY_CANDIDATES);
}

function connectedCluster(cells) {
  if (!cells.length) return false;
  const remaining = new Set(cells.map(cellKey));
  const queue = [cells[0]];
  remaining.delete(cellKey(cells[0]));

  while (queue.length) {
    const current = queue.shift();
    const neighbors = [
      { x: current.x + 1, y: current.y },
      { x: current.x - 1, y: current.y },
      { x: current.x, y: current.y + 1 },
      { x: current.x, y: current.y - 1 },
    ];
    neighbors.forEach((neighbor) => {
      const key = cellKey(neighbor);
      if (!remaining.has(key)) return;
      remaining.delete(key);
      const cell = cells.find((candidate) => candidate.x === neighbor.x && candidate.y === neighbor.y);
      if (cell) queue.push(cell);
    });
  }

  return remaining.size === 0;
}

function clusterScore(cells, origin) {
  const distances = cells.map((cell) => manhattan(cell, origin));
  const xs = cells.map((cell) => cell.x);
  const ys = cells.map((cell) => cell.y);
  const spanX = Math.max(...xs) - Math.min(...xs);
  const spanY = Math.max(...ys) - Math.min(...ys);
  const area = (spanX + 1) * (spanY + 1);
  const containsOrigin = cells.some((cell) => cell.x === origin.x && cell.y === origin.y);

  let pairwiseDistance = 0;
  for (let i = 0; i < cells.length; i += 1) {
    for (let j = i + 1; j < cells.length; j += 1) {
      pairwiseDistance += manhattan(cells[i], cells[j]);
    }
  }

  return (containsOrigin ? 0 : 80)
    + Math.max(...distances) * 30
    + distances.reduce((sum, value) => sum + value, 0) * 4
    + area * 5
    + (spanX + spanY) * 3
    + pairwiseDistance;
}

function clusterTieKey(cells) {
  return cells
    .map(cellKey)
    .sort()
    .join('|');
}

function bestConnectedCluster(candidates, size, origin) {
  if (size <= 0 || candidates.length < size) return null;
  let best = null;
  let bestScore = Infinity;
  let bestTie = '';

  const picked = [];
  function visit(start) {
    if (picked.length === size) {
      if (!connectedCluster(picked)) return;
      const score = clusterScore(picked, origin);
      const tie = clusterTieKey(picked);
      if (score < bestScore || (score === bestScore && (!best || tie < bestTie))) {
        best = picked.map((cell) => Object.freeze({ ...cell }));
        bestScore = score;
        bestTie = tie;
      }
      return;
    }

    const remainingNeeded = size - picked.length;
    for (let index = start; index <= candidates.length - remainingNeeded; index += 1) {
      picked.push(candidates[index]);
      visit(index + 1);
      picked.pop();
    }
  }

  visit(0);
  return best;
}

function assignmentCost(memberId, cell) {
  const target = PARTY_ROLE_TARGETS[memberId];
  return Math.abs(cell.localForward - target.forward) * 3
    + Math.abs(cell.localLeft - target.left) * 2
    + cell.distance * 0.15;
}

function bestAssignment(memberIds, cells) {
  let best = null;
  let bestCost = Infinity;
  let bestTie = '';
  const used = new Set();
  const entries = [];

  function visit(index, cost) {
    if (index === memberIds.length) {
      const tie = entries.map(([memberId, cell]) => `${memberId}:${cellKey(cell)}`).join('|');
      if (cost < bestCost || (cost === bestCost && (!best || tie < bestTie))) {
        best = entries.map(([memberId, cell]) => [memberId, Object.freeze({ x: cell.x, y: cell.y })]);
        bestCost = cost;
        bestTie = tie;
      }
      return;
    }

    const memberId = memberIds[index];
    cells.forEach((cell, cellIndex) => {
      if (used.has(cellIndex)) return;
      used.add(cellIndex);
      entries.push([memberId, cell]);
      visit(index + 1, cost + assignmentCost(memberId, cell));
      entries.pop();
      used.delete(cellIndex);
    });
  }

  visit(0, 0);
  return best || [];
}

export function chroniclesPartyGridFootprint(state) {
  const origin = {
    x: Number(state?.x),
    y: Number(state?.y),
  };
  if (!Number.isInteger(origin.x) || !Number.isInteger(origin.y)) return Object.freeze({});

  const presentIds = new Set((state?.party || [])
    .filter((member) => Number(member?.hp || 0) > 0)
    .map((member) => member?.id)
    .filter(Boolean));
  const aliveIds = CHRONICLES_PARTY_GRID_ORDER.filter((id) => presentIds.has(id));
  if (!aliveIds.length) return Object.freeze({});

  const basis = formationBasis(Number(state?.direction));
  const occupied = occupiedCells(state);
  const candidates = deployCandidates(state, origin, occupied, basis);

  let slotCount = CHRONICLES_PARTY_GRID_ORDER.length;
  let cluster = null;
  while (!cluster && slotCount >= aliveIds.length) {
    cluster = bestConnectedCluster(candidates, slotCount, origin);
    slotCount -= 1;
  }
  if (!cluster) cluster = bestConnectedCluster(candidates, aliveIds.length, origin);
  if (!cluster) return Object.freeze({});

  const slotIds = CHRONICLES_PARTY_GRID_ORDER.slice(0, cluster.length);
  const assigned = Object.fromEntries(bestAssignment(slotIds, cluster));

  return Object.freeze(Object.fromEntries(aliveIds.flatMap((memberId) => (
    assigned[memberId] ? [[memberId, assigned[memberId]]] : []
  ))));
}

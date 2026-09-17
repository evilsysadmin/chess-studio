import {
  CHRONICLES_DIRECTIONS,
  CHRONICLES_ENEMIES,
  CHRONICLES_MAP,
  chroniclesEnemyIsActive,
  chroniclesEnemyPosition,
} from './chroniclesOfMatthias.js';

export const CHRONICLES_PARTY_GRID_ORDER = Object.freeze(['matthias', 'rook', 'bishop', 'knight']);

function cellKey({ x, y }) {
  return `${x}:${y}`;
}

function isWalkableCell({ x, y }) {
  return Boolean(CHRONICLES_MAP[y]?.[x] && CHRONICLES_MAP[y][x] !== '#');
}

function runtimeEnemyPosition(state, enemy) {
  const runtime = state?.enemyPositions?.[enemy.id];
  if (runtime && Number.isFinite(runtime.x) && Number.isFinite(runtime.y)) return runtime;
  return chroniclesEnemyPosition(state, enemy);
}

function formationSteps(directionIndex) {
  const forward = CHRONICLES_DIRECTIONS[directionIndex] || CHRONICLES_DIRECTIONS[1];
  const left = { dx: forward.dy, dy: -forward.dx };
  const right = { dx: -forward.dy, dy: forward.dx };
  const back = { dx: -forward.dx, dy: -forward.dy };
  return [left, right, back, forward];
}

function blockedEnemyCells(state) {
  return new Set(CHRONICLES_ENEMIES.flatMap((enemy) => {
    const active = chroniclesEnemyIsActive(state, enemy) && Number(state?.[enemy.hpKey] || 0) > 0;
    return active ? [cellKey(runtimeEnemyPosition(state, enemy))] : [];
  }));
}

export function chroniclesPartyGridFootprint(state) {
  const origin = {
    x: Number(state?.x),
    y: Number(state?.y),
  };
  if (!Number.isInteger(origin.x) || !Number.isInteger(origin.y)) return Object.freeze({});

  const presentIds = new Set((state?.party || []).map((member) => member?.id).filter(Boolean));
  const memberIds = CHRONICLES_PARTY_GRID_ORDER.filter((id) => presentIds.has(id));
  if (!memberIds.length) return Object.freeze({});

  const blocked = blockedEnemyCells(state);
  const steps = formationSteps(Number(state?.direction));
  const visited = new Set([cellKey(origin)]);
  const queue = [origin];
  const slots = [];

  while (queue.length && slots.length < memberIds.length) {
    const cell = queue.shift();
    const key = cellKey(cell);
    if (!isWalkableCell(cell) || blocked.has(key)) continue;

    slots.push(Object.freeze({ x: cell.x, y: cell.y }));
    steps.forEach(({ dx, dy }) => {
      const next = { x: cell.x + dx, y: cell.y + dy };
      const nextKey = cellKey(next);
      if (visited.has(nextKey)) return;
      visited.add(nextKey);
      if (isWalkableCell(next) && !blocked.has(nextKey)) queue.push(next);
    });
  }

  // A map authored for Tactics is expected to expose at least four connected,
  // unoccupied floor cells. Keeping missing slots absent is safer than fabricating
  // an overlapping hero on the leader cell if malformed content ever violates it.
  return Object.freeze(Object.fromEntries(memberIds.flatMap((memberId, index) => (
    slots[index] ? [[memberId, slots[index]]] : []
  ))));
}

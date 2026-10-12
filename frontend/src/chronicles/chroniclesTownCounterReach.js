// One shared authority for town-counter opening and transactions. The entrance
// is the authored, walkable street tile; from the next tile a player must face
// it, with no interactions possible through an opaque wall or from afar.
const DIRECTIONS = Object.freeze([
  Object.freeze({ dx: 0, dy: -1 }),
  Object.freeze({ dx: 1, dy: 0 }),
  Object.freeze({ dx: 0, dy: 1 }),
  Object.freeze({ dx: -1, dy: 0 }),
]);

export function chroniclesTownCounterInReach(state, entry, map) {
  if (!state || !entry || !map || !Number.isInteger(entry.x) || !Number.isInteger(entry.y)) return false;
  if (entry.x === state.x && entry.y === state.y) return true;
  const direction = DIRECTIONS[state.direction];
  const tile = map.grid?.[entry.y]?.[entry.x];
  return Boolean(direction && tile && tile !== '#'
    && entry.x === state.x + direction.dx && entry.y === state.y + direction.dy);
}

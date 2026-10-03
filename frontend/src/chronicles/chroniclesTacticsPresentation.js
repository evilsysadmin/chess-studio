import { chroniclesMapForState } from './chroniclesMapCatalog.js';

export function chroniclesTacticsLocationLabel(state) {
  const map = chroniclesMapForState(state);
  return map?.title || 'Chronicles of Matthias';
}


const TACTICS_MOVE_DIRECTIONS = Object.freeze({
  west: Object.freeze({ dx: -1, dy: 0 }),
  north: Object.freeze({ dx: 0, dy: -1 }),
  south: Object.freeze({ dx: 0, dy: 1 }),
  east: Object.freeze({ dx: 1, dy: 0 }),
});

export function chroniclesTacticsMoveAvailability(state, legalMoves = []) {
  const canAct = Boolean(
    state
    && state.turnPhase !== 'enemy'
    && state.phase !== 'defeated'
    && state.phase !== 'escaped'
  );
  const moves = Array.isArray(legalMoves) ? legalMoves : [];

  return Object.freeze(Object.fromEntries(
    Object.entries(TACTICS_MOVE_DIRECTIONS).map(([key, direction]) => [
      key,
      canAct && moves.some((move) => (
        move.x === state.x + direction.dx
        && move.y === state.y + direction.dy
      )),
    ]),
  ));
}

import {
  CHRONICLES_DIRECTIONS,
  CHRONICLES_ENEMIES,
  chroniclesEnemyIsActive,
  chroniclesEnemyPosition,
  chroniclesTileAt,
} from './chroniclesOfMatthias.js';

export function chroniclesTargetAhead(state, maxReach = 2) {
  if (!state || state.phase === 'escaped' || maxReach < 1) return null;
  const direction = CHRONICLES_DIRECTIONS[state.direction];
  if (!direction) return null;

  for (let distance = 1; distance <= maxReach; distance += 1) {
    const x = state.x + direction.dx * distance;
    const y = state.y + direction.dy * distance;
    if (chroniclesTileAt(x, y) === '#') return null;

    const enemy = CHRONICLES_ENEMIES.find((candidate) => {
      if (!chroniclesEnemyIsActive(state, candidate)) return false;
      if (Number(state[candidate.hpKey] || 0) <= 0) return false;
      const position = chroniclesEnemyPosition(state, candidate);
      return position.x === x && position.y === y;
    });
    if (!enemy) continue;

    const retaliationReach = Number(enemy.retaliationReach ?? 1);
    return {
      id: enemy.id,
      name: enemy.name,
      hp: Number(state[enemy.hpKey] || 0),
      maxHp: enemy.maxHp,
      distance,
      retaliation: enemy.retaliation,
      retaliationReach,
      willRetaliate: distance <= retaliationReach,
    };
  }

  return null;
}

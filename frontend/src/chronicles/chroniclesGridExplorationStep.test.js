import { describe, it, expect, vi } from 'vitest';
import { chroniclesGridExplorationStep } from './chroniclesGridExplorationStep.js';

vi.mock('../chroniclesOfMatthias.js', () => ({
  chroniclesReduce: vi.fn((state, action) => action === 'forward'
    ? { ...state, x: state.x + 1 }
    : { ...state, direction: (state.direction + 1) % 4 }),
  chroniclesActiveEnemies: vi.fn(() => [{ id: 'sentinel' }]),
}));
vi.mock('../chroniclesOfMatthiasTurns.js', () => ({
  chroniclesRuntimeEnemyPosition: vi.fn((state) => state.enemyPositions?.sentinel || { x: 4, y: 2 }),
  chroniclesChooseEnemyStep: vi.fn((state) => {
    const p = state.enemyPositions?.sentinel || { x: 4, y: 2 };
    return { x: p.x - 1, y: p.y };
  }),
}));
describe('one party tile, one enemy move', () => {
  const state = { x: 1, y: 1, direction: 0, phase: 'explore', enemyPositions: { sentinel: { x: 4, y: 2 } } };
  it('moves enemies exactly once after a successful tile step', () => {
    const first = chroniclesGridExplorationStep(state, 'forward');
    expect(first.x).toBe(2);
    expect(first.enemyPositions.sentinel).toEqual({ x: 3, y: 2 });
    const second = chroniclesGridExplorationStep(first, 'forward');
    expect(second.enemyPositions.sentinel).toEqual({ x: 2, y: 2 });
  });
  it('does not activate an enemy for turning in place', () => {
    expect(chroniclesGridExplorationStep(state, 'turn-right').enemyPositions).toEqual(state.enemyPositions);
  });
  it('does not grant exploration movement during initiative combat', () => {
    const combat = { ...state, phase: 'combat' };
    expect(chroniclesGridExplorationStep(combat, 'forward').enemyPositions).toEqual(combat.enemyPositions);
  });
});

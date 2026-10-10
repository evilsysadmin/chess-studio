import { describe, expect, it } from 'vitest';
import { chroniclesPartyAttackStats, chroniclesReduce, createChroniclesState } from '../chroniclesOfMatthias.js';
import { chroniclesGoldBalance } from './chroniclesContentRuntime.js';
import { chroniclesMapById } from './chroniclesMapCatalog.js';
import {
  chroniclesApplyRunCheckpoint,
  chroniclesRunCheckpointPayload,
} from './chroniclesRunCheckpoint.js';

describe('Chronicles · optional banner road ambusher', () => {
  it('spawns as a real, optional enemy on walkable terrain', () => {
    const map = chroniclesMapById('banner-road-first-book');
    const enemy = map.enemies.find((entry) => entry.id === 'banner-road-deserter');
    // The authored file starts at 4 HP; the resolved enemyBuild has 5 effective HP.
    expect(enemy).toMatchObject({
      optional: true, visualType: 'corrupted-pawn', hpKey: 'bannerRoadDeserterHp',
      maxHp: 5, x: 11, y: 5,
    });
    expect(map.grid[enemy.y][enemy.x]).not.toBe('#');
    expect(createChroniclesState('banner-road-first-book').bannerRoadDeserterHp).toBe(5);
  });

  it('allows first-person combat and grants exactly three gold only on the kill', () => {
    let state = createChroniclesState('banner-road-first-book');
    state = { ...state, x: 11, y: 6, direction: 0 };
    // Hildegard has enough HP to survive the retaliation; Matthias alone
    // can be knocked out before finishing this five-HP combat encounter.
    const damage = chroniclesPartyAttackStats(state, 'rook').damage;
    const blows = Math.ceil(state.bannerRoadDeserterHp / damage);
    expect(blows).toBeGreaterThan(1);
    for (let hit = 1; hit < blows; hit += 1) {
      state = chroniclesReduce(state, { type: 'attack', memberId: 'rook' });
      expect(state.bannerRoadDeserterHp).toBe(5 - hit * damage);
      expect(chroniclesGoldBalance(state)).toBe(0);
    }
    state = chroniclesReduce(state, { type: 'attack', memberId: 'rook' });
    expect(state.bannerRoadDeserterHp).toBe(0);
    expect(state.bannerRoadDeserterDefeated).toBe(true);
    expect(chroniclesGoldBalance(state)).toBe(3);
    expect(state.journal.filter((entry) => entry.id === 'banner-road-deserter-falls')).toHaveLength(1);
    const after = chroniclesReduce(state, { type: 'attack', memberId: 'rook' });
    expect(chroniclesGoldBalance(after)).toBe(3);
    expect(after.journal.filter((entry) => entry.id === 'banner-road-deserter-falls')).toHaveLength(1);

    const snapshot = chroniclesRunCheckpointPayload(after, 5);
    const recovered = chroniclesApplyRunCheckpoint(
      createChroniclesState('banner-road-first-book'),
      snapshot,
    );
    expect(recovered.bannerRoadDeserterHp).toBe(0);
    expect(recovered.bannerRoadDeserterDefeated).toBe(true);
    expect(chroniclesGoldBalance(recovered)).toBe(3);
    expect(chroniclesGoldBalance(chroniclesReduce(recovered, { type: 'attack', memberId: 'rook' }))).toBe(3);
  });
});

import { describe, expect, it } from 'vitest';
import { chroniclesContextualContentAction, createChroniclesState } from '../chroniclesOfMatthias.js';
import { chroniclesTacticsUse } from '../chroniclesOfMatthiasTactics.js';
import { chroniclesGoldBalance } from './chroniclesContentRuntime.js';
import { chroniclesMapById } from './chroniclesMapCatalog.js';
import { chroniclesApplyRunCheckpoint, chroniclesRunCheckpointPayload } from './chroniclesRunCheckpoint.js';

function walkTo(state, x, y) { return { ...state, x, y }; }

function defeatEffects(mapId, enemyId) {
  return chroniclesMapById(mapId).enemies.find((enemy) => enemy.id === enemyId).onDefeat.effects;
}

describe('Chronicles · Swordhaven side quests', () => {
  it('authors the new foes as optional overworld enemies on walkable cells', () => {
    for (const [mapId, enemyId, visualType] of [
      ['banner-road-first-book', 'banner-road-deserter', 'road-bandit'],
      ['banner-road-first-book', 'banner-road-bandit-captain', 'bandit-captain'],
      ['rookwood-first-book', 'rookwood-weaver', 'weaver-spider'],
    ]) {
      const map = chroniclesMapById(mapId);
      const enemy = map.enemies.find((entry) => entry.id === enemyId);
      expect(enemy, enemyId).toMatchObject({ optional: true, visualType });
      expect(map.grid[enemy.y][enemy.x]).not.toBe('#');
    }
    expect(defeatEffects('banner-road-first-book', 'banner-road-bandit-captain'))
      .toContainEqual({ type: 'set', key: 'bannerRoadCaptainDefeated', value: true });
    expect(defeatEffects('rookwood-first-book', 'rookwood-weaver'))
      .toContainEqual(expect.objectContaining({ type: 'grant-item', itemId: 'weaver-silk', quantity: 1 }));
  });

  it('«Bandidos del Camino»: Brask gives it, both bandits must fall, and it pays once', () => {
    let state = walkTo(createChroniclesState('swordhaven-first-book'), 4, 6);
    expect(chroniclesContextualContentAction(state)?.id).toBe('first-book-watch-house');
    state = chroniclesTacticsUse(state, 'first-book-watch-house');
    expect(state.quests['road-bandits'].status).toBe('active');
    // Nothing to report yet: the turn-in stays hidden until both bandits fall.
    expect(chroniclesContextualContentAction(state)?.id).not.toBe('first-book-watch-reward');

    state = chroniclesTacticsUse(walkTo(state, 9, 1), 'to-first-book-banner-road');
    expect(state.mapId).toBe('banner-road-first-book');
    state = { ...state, bannerRoadDeserterDefeated: true };
    state = chroniclesTacticsUse(walkTo(state, 10, 1), 'to-first-book-swordhaven');
    expect(chroniclesContextualContentAction(walkTo(state, 4, 6))?.id).not.toBe('first-book-watch-reward');

    state = { ...state, bannerRoadCaptainDefeated: true };
    state = walkTo(state, 4, 6);
    expect(chroniclesContextualContentAction(state)?.id).toBe('first-book-watch-reward');
    const before = chroniclesGoldBalance(state);
    state = chroniclesTacticsUse(state, 'first-book-watch-reward');
    expect(state.quests['road-bandits'].status).toBe('completed');
    expect(chroniclesGoldBalance(state)).toBe(before + 12);
    expect(state.claimedRewards).toContain('swordhaven:road-bandits:v1');
    expect(chroniclesContextualContentAction(state)?.id).not.toBe('first-book-watch-reward');

    const restored = chroniclesApplyRunCheckpoint(
      createChroniclesState('swordhaven-first-book'),
      chroniclesRunCheckpointPayload(state, 3),
    );
    expect(restored.quests['road-bandits'].status).toBe('completed');
    expect(chroniclesGoldBalance(restored)).toBe(before + 12);
  });

  it('«Seda para las vendas»: Ilse takes the weaver silk for gold and healing', () => {
    let state = walkTo(createChroniclesState('swordhaven-first-book'), 14, 6);
    expect(chroniclesContextualContentAction(state)?.id).toBe('first-book-temple');
    state = chroniclesTacticsUse(state, 'first-book-temple');
    expect(state.quests['weaver-silk'].status).toBe('active');
    expect(chroniclesContextualContentAction(state)?.id).not.toBe('first-book-temple-reward');

    state = {
      ...state,
      inventory: {
        ...state.inventory,
        'weaver-silk': { itemId: 'weaver-silk', name: 'Seda de tejedora', quantity: 1 },
      },
    };
    expect(chroniclesContextualContentAction(state)?.id).toBe('first-book-temple-reward');
    const before = chroniclesGoldBalance(state);
    state = chroniclesTacticsUse(state, 'first-book-temple-reward');
    expect(state.quests['weaver-silk'].status).toBe('completed');
    expect(chroniclesGoldBalance(state)).toBe(before + 8);
    expect(state.inventory['weaver-silk']?.quantity || 0).toBe(0);
    expect(state.claimedRewards).toContain('swordhaven:weaver-silk:v1');
  });
});

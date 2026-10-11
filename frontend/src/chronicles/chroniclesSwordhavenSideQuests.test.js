import { describe, expect, it } from 'vitest';
import { chroniclesContextualContentAction, chroniclesReduce, createChroniclesState } from '../chroniclesOfMatthias.js';
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
    // Nothing to report yet: the door stays usable but locked, and says why.
    expect(chroniclesContextualContentAction(state)).toMatchObject({ id: 'first-book-watch-reward', locked: true });
    expect(chroniclesTacticsUse(state, 'first-book-watch-reward').quests['road-bandits'].status).toBe('active');

    state = chroniclesTacticsUse(walkTo(state, 9, 1), 'to-first-book-banner-road');
    expect(state.mapId).toBe('banner-road-first-book');
    state = { ...state, bannerRoadDeserterDefeated: true };
    state = chroniclesTacticsUse(walkTo(state, 10, 1), 'to-first-book-swordhaven');
    expect(chroniclesContextualContentAction(walkTo(state, 4, 6))?.locked).toBe(true);

    state = { ...state, bannerRoadCaptainDefeated: true };
    state = walkTo(state, 4, 6);
    expect(chroniclesContextualContentAction(state)).toMatchObject({ id: 'first-book-watch-reward', locked: false });
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
    // Without the silk the temple is still usable: Ilse says what she needs.
    expect(chroniclesContextualContentAction(state)).toMatchObject({ id: 'first-book-temple-reward', locked: true });

    state = {
      ...state,
      inventory: {
        ...state.inventory,
        'weaver-silk': { itemId: 'weaver-silk', name: 'Seda de tejedora', quantity: 1 },
      },
    };
    expect(chroniclesContextualContentAction(state)).toMatchObject({ id: 'first-book-temple-reward', locked: false });
    const before = chroniclesGoldBalance(state);
    state = chroniclesTacticsUse(state, 'first-book-temple-reward');
    expect(state.quests['weaver-silk'].status).toBe('completed');
    expect(chroniclesGoldBalance(state)).toBe(before + 8);
    expect(state.inventory['weaver-silk']?.quantity || 0).toBe(0);
    expect(state.claimedRewards).toContain('swordhaven:weaver-silk:v1');
  });
});

describe('Chronicles · Swordhaven doors', () => {
  const town = () => createChroniclesState('swordhaven-first-book', null, { rules: 'mm3' });

  it('walking into a shop door from its street cell opens the counter', () => {
    // Forja de Brunna: door cell (7,4), building to the north.
    const state = chroniclesReduce({ ...town(), x: 7, y: 4, direction: 0 }, 'forward');
    expect(state.shop?.id).toBe('first-book-weaponsmith');
    expect(state.x).toBe(7);
    expect(state.y).toBe(4);
  });

  it('walking into the facade elsewhere says where the door is', () => {
    const right = chroniclesReduce({ ...town(), x: 6, y: 4, direction: 0 }, 'forward');
    expect(right.shop).toBeUndefined();
    expect(right.message).toMatch(/Forja de Brunna está un paso a tu derecha/);
    const left = chroniclesReduce({ ...town(), x: 8, y: 4, direction: 0 }, 'forward');
    expect(left.message).toMatch(/un paso a tu izquierda/);
  });

  it('a temple with nothing to hand over still answers at its door', () => {
    let state = { ...town(), x: 14, y: 6, direction: 1 };
    state = chroniclesReduce(state, 'forward');
    // First visit: Ilse gives the side quest.
    expect(state.quests['weaver-silk'].status).toBe('active');
    // Without the silk, bumping the door explains what she needs.
    const again = chroniclesReduce(state, 'forward');
    expect(again.message).toMatch(/seda de la tejedora/);
    expect(again.quests['weaver-silk'].status).toBe('active');
  });
});

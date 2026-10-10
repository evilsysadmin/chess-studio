import { describe, expect, it } from 'vitest';
import { chroniclesContextualContentAction, chroniclesReduce, createChroniclesState } from '../chroniclesOfMatthias.js';
import { chroniclesTacticsInteractions, chroniclesTacticsUse } from '../chroniclesOfMatthiasTactics.js';
import { chroniclesGoldBalance, chroniclesInventoryEntries } from './chroniclesContentRuntime.js';
import {
  chroniclesMapById,
  chroniclesMapIds,
} from './chroniclesMapCatalog.js';
import {
  chroniclesApplyRunCheckpoint,
  chroniclesRunCheckpointPayload,
} from './chroniclesRunCheckpoint.js';

function walkTo(state, x, y) { return { ...state, x, y }; }

describe('Chronicles first book · Swordhaven / Banner Road', () => {
  it('ships a reversible new-world route without changing either previous map identity', () => {
    const ids = chroniclesMapIds();
    for (const id of ['swordhaven-square', 'swordhaven-campaign', 'banner-road', 'swordhaven-first-book', 'banner-road-first-book']) {
      expect(ids).toContain(id);
    }
    const city = chroniclesMapById('swordhaven-first-book');
    const road = chroniclesMapById('banner-road-first-book');
    expect(city.regionKind).toBe('settlement');
    expect(road.regionKind).toBe('wilderness');
    expect(city.exits[0].action.effects[0]).toMatchObject({
      type: 'transition-map', mapId: road.id, entryExitId: 'to-first-book-swordhaven',
    });
    expect(road.exits[0].action.effects[0]).toMatchObject({
      type: 'transition-map', mapId: city.id, entryExitId: 'to-first-book-banner-road',
    });
    expect(chroniclesMapById('swordhaven-campaign').interactables.map((e) => e.id))
      .not.toContain('first-book-quartermaster');
  });

  it('completes one sidequest loop: take job, cross road, find clue, return, receive gold and trade', () => {
    let state = createChroniclesState('swordhaven-first-book');
    state = walkTo(state, 11, 9);
    expect(chroniclesTacticsInteractions(state)).toContainEqual(expect.objectContaining({
      id: 'first-book-missing-board',
    }));
    state = chroniclesTacticsUse(state, 'first-book-missing-board');
    expect(state.quests['banner-contract']).toMatchObject({
      status: 'active', objective: 'Busca el estandarte cerca del mojón sin nombre.',
    });
    state = walkTo(state, 9, 1);
    state = chroniclesTacticsUse(state, 'to-first-book-banner-road');
    expect(state.mapId).toBe('banner-road-first-book');
    expect({ x: state.x, y: state.y }).toEqual({ x: 10, y: 1 });
    expect(chroniclesGoldBalance(state)).toBe(0);

    state = walkTo(state, 9, 5);
    expect(chroniclesTacticsInteractions(state)).toContainEqual(expect.objectContaining({
      id: 'first-book-lost-banner',
    }));
    state = chroniclesTacticsUse(state, 'first-book-lost-banner');
    expect(chroniclesInventoryEntries(state)).toContainEqual(expect.objectContaining({
      id: 'knight-banner', quantity: 1,
    }));
    expect(state.quests['banner-contract'].objective).toMatch(/Regresa/);
    expect(chroniclesTacticsInteractions(state).some((i) => i.id === 'first-book-lost-banner')).toBe(false);

    state = walkTo(state, 10, 1);
    state = chroniclesTacticsUse(state, 'to-first-book-swordhaven');
    expect(state.mapId).toBe('swordhaven-first-book');
    state = walkTo(state, 11, 9);
    expect(chroniclesTacticsInteractions(state)).toContainEqual(expect.objectContaining({
      id: 'first-book-banner-turn-in',
    }));
    const paid = chroniclesTacticsUse(state, 'first-book-banner-turn-in');
    expect(chroniclesGoldBalance(paid)).toBe(18);
    expect(paid.quests['banner-contract'].status).toBe('completed');
    expect(paid.inventory).not.toHaveProperty('knight-banner');
    expect(paid.claimedRewards).toContain('swordhaven:banner-contract:v1');
    expect(chroniclesTacticsInteractions(paid).some((i) => i.id === 'first-book-banner-turn-in')).toBe(false);

    const merchant = walkTo(paid, 15, 10);
    const choices = chroniclesTacticsInteractions(merchant);
    expect(choices).toContainEqual(expect.objectContaining({
      id: 'first-book-quartermaster', locked: false,
    }));
    const bought = chroniclesTacticsUse(merchant, 'first-book-quartermaster');
    expect(chroniclesGoldBalance(bought)).toBe(11);
    expect(chroniclesInventoryEntries(bought)).toContainEqual(expect.objectContaining({
      id: 'road-rations', quantity: 1,
    }));
    const rest = walkTo(bought, 7, 10);
    const healed = chroniclesTacticsUse({
      ...rest, party: rest.party.map((member) => ({ ...member, hp: Math.max(1, member.hp - 4) })),
    }, 'first-book-healer');
    expect(chroniclesGoldBalance(healed)).toBe(6);
    healed.party.forEach((member) => expect(member.hp).toBe(member.maxHp));
  });

  it('lets the first-person player take, finish and spend a contract without competing NPC actions', () => {
    let state = createChroniclesState('swordhaven-first-book');
    state = walkTo(state, 11, 9);
    expect(chroniclesContextualContentAction(state)?.id).toBe('first-book-missing-board');
    state = chroniclesReduce(state, 'interact');
    expect(state.quests['banner-contract'].status).toBe('active');
    // The board is consumed after accepting; it must not shadow the turn-in.
    expect(chroniclesContextualContentAction(state)?.id).not.toBe('first-book-missing-board');

    state = chroniclesReduce({ ...state, x: 9, y: 2, direction: 0 }, 'forward');
    expect(state.mapId).toBe('banner-road-first-book');
    state = walkTo(state, 9, 5);
    expect(chroniclesContextualContentAction(state)?.id).toBe('first-book-lost-banner');
    state = chroniclesReduce(state, 'interact');
    expect(state.inventory['knight-banner'].quantity).toBe(1);

    state = chroniclesReduce({ ...state, x: 10, y: 2, direction: 0 }, 'forward');
    expect(state.mapId).toBe('swordhaven-first-book');
    state = walkTo(state, 11, 9);
    expect(chroniclesContextualContentAction(state)?.id).toBe('first-book-banner-turn-in');
    state = chroniclesReduce(state, 'interact');
    expect(chroniclesGoldBalance(state)).toBe(18);
    expect(chroniclesContextualContentAction(state)?.id).not.toBe('first-book-banner-turn-in');

    state = walkTo(state, 15, 10);
    expect(chroniclesContextualContentAction(state)?.id).toBe('first-book-quartermaster');
    state = chroniclesReduce(state, 'interact');
    expect(chroniclesGoldBalance(state)).toBe(11);
    expect(state.inventory['road-rations'].quantity).toBe(1);
    expect(state.claimedRewards).toEqual(['swordhaven:banner-contract:v1']);
  });

  it('recovers completed quest, spent gold, visited region and reward receipt after F5', () => {
    const initial = createChroniclesState('swordhaven-first-book');
    let state = chroniclesTacticsUse(walkTo(initial, 11, 9), 'first-book-missing-board');
    state = chroniclesTacticsUse(walkTo(state, 9, 1), 'to-first-book-banner-road');
    state = chroniclesTacticsUse(walkTo(state, 9, 5), 'first-book-lost-banner');
    state = chroniclesTacticsUse(walkTo(state, 10, 1), 'to-first-book-swordhaven');
    state = chroniclesTacticsUse(walkTo(state, 11, 9), 'first-book-banner-turn-in');
    state = chroniclesTacticsUse(walkTo(state, 15, 10), 'first-book-quartermaster');
    const snapshot = chroniclesRunCheckpointPayload(state, 7);
    expect(snapshot.currentMapId).toBe('swordhaven-first-book');
    expect(snapshot.claimedRewards).toEqual(['swordhaven:banner-contract:v1']);
    const restored = chroniclesApplyRunCheckpoint(createChroniclesState('swordhaven-first-book'), snapshot);
    expect(chroniclesGoldBalance(restored)).toBe(11);
    expect(restored.inventory['road-rations'].quantity).toBe(1);
    expect(restored.quests['banner-contract'].status).toBe('completed');
    expect(restored.missingKnightsNotice).toBeUndefined();
    expect(restored['missing-knights-notice']).toBe(true);
    expect(restored.bannerFound).toBe(true);
    expect(chroniclesTacticsInteractions(walkTo(restored, 11, 9)).some((i) =>
      i.id === 'first-book-banner-turn-in')).toBe(false);
    expect(chroniclesRunCheckpointPayload(restored, 8).claimedRewards).toEqual(snapshot.claimedRewards);
  });
});

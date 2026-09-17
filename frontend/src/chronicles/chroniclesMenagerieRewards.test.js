import { describe, expect, it } from 'vitest';
import { createChroniclesState } from '../chroniclesOfMatthias.js';
import {
  chroniclesTacticsInteractions,
  chroniclesTacticsUse,
} from '../chroniclesOfMatthiasTactics.js';
import {
  chroniclesApplyContentEffects,
  chroniclesItemCount,
} from './chroniclesContentRuntime.js';
import {
  chroniclesMapById,
  chroniclesMapTransitionState,
} from './chroniclesMapCatalog.js';

describe('Chronicles Menagerie optional rewards', () => {
  it('turns the optional ember wisp into a real item-backed side reward', () => {
    const map = chroniclesMapById('menagerie-of-ash');
    const wisp = map.enemies.find((enemy) => enemy.id === 'ember-wisp');
    expect(wisp.optional).toBe(true);
    expect(wisp.onDefeat.effects).toContainEqual({
      type: 'grant-item',
      itemId: 'ember-shard',
      amount: 1,
    });

    let state = chroniclesMapTransitionState(createChroniclesState(), map.id);
    state = chroniclesApplyContentEffects(state, wisp.onDefeat.effects);
    expect(chroniclesItemCount(state, 'ember-shard')).toBe(1);

    state = {
      ...state,
      x: 3,
      y: 1,
      party: state.party.map((member) => ({ ...member, hp: Math.max(1, member.hp - 2) })),
      classAbilityCharges: Object.fromEntries(state.party.map((member) => [member.id, 0])),
    };
    expect(chroniclesTacticsInteractions(state)).toContainEqual(expect.objectContaining({
      id: 'ember-cache',
      label: 'Abrir alijo de brasa',
    }));

    const opened = chroniclesTacticsUse(state, 'ember-cache');
    expect(opened.emberCacheOpened).toBe(true);
    expect(chroniclesItemCount(opened, 'ember-shard')).toBe(0);
    opened.party.forEach((member, index) => {
      expect(member.hp).toBeGreaterThanOrEqual(state.party[index].hp);
    });
    opened.party.forEach((member) => {
      expect(opened.classAbilityCharges[member.id]).toBeGreaterThan(0);
    });
    expect(opened.journal.at(-1)?.id).toBe('ember-cache-opened');
  });

  it('keeps the ember cache unavailable when the player skips the wisp', () => {
    const state = {
      ...chroniclesMapTransitionState(createChroniclesState(), 'menagerie-of-ash'),
      x: 3,
      y: 1,
    };

    expect(chroniclesItemCount(state, 'ember-shard')).toBe(0);
    expect(chroniclesTacticsInteractions(state).map((entry) => entry.id)).not.toContain('ember-cache');
    expect(chroniclesTacticsUse(state, 'ember-cache')).toBe(state);
  });
});

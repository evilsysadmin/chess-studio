import { describe, expect, it } from 'vitest';
import { createChroniclesState } from '../chroniclesOfMatthias.js';
import {
  chroniclesTacticsAttack,
  chroniclesTacticsInteractions,
  chroniclesTacticsUse,
} from '../chroniclesOfMatthiasTactics.js';
import {
  chroniclesActiveQuest,
  chroniclesInventoryEntries,
  chroniclesQuestEntries,
} from './chroniclesContentRuntime.js';
import { chroniclesMapTransitionState } from './chroniclesMapCatalog.js';

describe('Chronicles Menagerie secret quest', () => {
  it('turns the optional wisp into a discoverable hidden-door loot chain', () => {
    let state = chroniclesMapTransitionState(createChroniclesState(), 'menagerie-of-ash');
    state = {
      ...state,
      x: 5,
      y: 5,
      emberWispHp: 1,
      classAbilityCharges: Object.fromEntries(state.party.map((member) => [member.id, 0])),
      party: state.party.map((member) => ({
        ...member,
        hp: Math.max(1, member.hp - 2),
      })),
    };

    expect(chroniclesInventoryEntries(state)).toEqual([]);
    expect(chroniclesActiveQuest(state)).toBeNull();

    const afterWisp = chroniclesTacticsAttack(state, 'knight', 'ember-wisp');
    expect(afterWisp.emberWispHp).toBe(0);
    expect(chroniclesInventoryEntries(afterWisp)).toEqual([
      expect.objectContaining({
        id: 'ember-shard',
        name: 'Esquirla de brasa',
        quantity: 1,
      }),
    ]);
    expect(chroniclesActiveQuest(afterWisp)).toMatchObject({
      id: 'the-lock-that-wasnt-there',
      status: 'active',
      objective: expect.stringMatching(/pared oeste/i),
    });

    const atSecret = { ...afterWisp, x: 1, y: 3 };
    expect(chroniclesTacticsInteractions(atSecret)).toContainEqual(expect.objectContaining({
      id: 'menagerie-secret-seam',
      kind: 'secret',
      label: 'Examinar junta ennegrecida',
    }));

    const opened = chroniclesTacticsUse(atSecret, 'menagerie-secret-seam');
    expect(opened.menagerieSecretOpened).toBe(true);
    expect(chroniclesInventoryEntries(opened).map((item) => item.id)).not.toContain('ember-shard');
    expect(chroniclesActiveQuest(opened)?.objective).toMatch(/relicario/i);
    expect(opened.journal.at(-1)?.id).toBe('menagerie-secret-opened');

    const atReliquary = { ...opened, x: 2, y: 3 };
    expect(chroniclesTacticsInteractions(atReliquary)).toContainEqual(expect.objectContaining({
      id: 'menagerie-hidden-reliquary',
      kind: 'pickup',
    }));

    const looted = chroniclesTacticsUse(atReliquary, 'menagerie-hidden-reliquary');
    expect(looted.menagerieReliquaryLooted).toBe(true);
    expect(chroniclesInventoryEntries(looted)).toEqual([
      expect.objectContaining({
        id: 'ossuary-signet',
        name: 'Sello del osario',
        quantity: 1,
      }),
    ]);
    expect(chroniclesActiveQuest(looted)).toBeNull();
    expect(chroniclesQuestEntries(looted, 'completed')).toContainEqual(expect.objectContaining({
      id: 'the-lock-that-wasnt-there',
      status: 'completed',
    }));
    looted.party.forEach((member, index) => {
      expect(member.hp).toBeGreaterThanOrEqual(state.party[index].hp);
      expect(looted.classAbilityCharges[member.id]).toBeGreaterThan(0);
    });
    expect(looted.journal.at(-1)?.id).toBe('menagerie-reliquary-looted');
  });

  it('keeps the hidden seam absent when the optional wisp is ignored', () => {
    const state = {
      ...chroniclesMapTransitionState(createChroniclesState(), 'menagerie-of-ash'),
      x: 1,
      y: 3,
    };

    expect(chroniclesTacticsInteractions(state).map((entry) => entry.id))
      .not.toContain('menagerie-secret-seam');
    expect(chroniclesTacticsUse(state, 'menagerie-secret-seam')).toBe(state);
  });
});

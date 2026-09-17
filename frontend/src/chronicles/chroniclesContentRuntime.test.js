import { describe, expect, it, vi } from 'vitest';
import {
  chroniclesActiveQuest,
  chroniclesApplyContentAction,
  chroniclesApplyContentEffects,
  chroniclesContentDefinition,
  chroniclesContentInteractions,
  chroniclesContentLockedMessage,
  chroniclesInventoryEntries,
  chroniclesQuestEntries,
  chroniclesRequirementsMet,
} from './chroniclesContentRuntime.js';

const syntheticMap = Object.freeze({
  triggers: Object.freeze([
    Object.freeze({
      id: 'totally-new-trigger',
      kind: 'trigger',
      tile: 'Q',
      label: 'Tocar cosa rara',
      when: Object.freeze([{ key: 'awake', equals: false }]),
      action: Object.freeze({
        effects: Object.freeze([{ type: 'set', key: 'awake', value: true }]),
        message: 'La cosa rara ha sido tocada.',
        journal: Object.freeze({ id: 'rare-touch', title: 'Cosa tocada', body: 'Funcionó.', sigil: '?' }),
      }),
    }),
  ]),
  interactables: Object.freeze([]),
  treasures: Object.freeze([]),
  traps: Object.freeze([]),
  exits: Object.freeze([
    Object.freeze({
      id: 'totally-new-exit',
      kind: 'exit',
      tile: 'Z',
      openLabel: 'Salir',
      lockedLabel: 'Mirar puerta',
      requirements: Object.freeze([
        Object.freeze({ key: 'awake', equals: true, message: 'Primero despierta la sala.' }),
      ]),
      action: Object.freeze({
        effects: Object.freeze([{ type: 'set', key: 'phase', value: 'escaped' }]),
      }),
    }),
  ]),
});

function tileAt(x, y) {
  if (x === 2 && y === 2) return 'Q';
  if (x === 3 && y === 2) return 'Z';
  return '.';
}

describe('Chronicles content runtime', () => {
  it('discovers arbitrary trigger ids and applies their declarative action', () => {
    const state = { x: 2, y: 2, awake: false, journal: [] };
    const [interaction] = chroniclesContentInteractions(state, syntheticMap, tileAt);

    expect(interaction).toEqual(expect.objectContaining({
      id: 'totally-new-trigger',
      label: 'Tocar cosa rara',
    }));
    expect(chroniclesContentDefinition(syntheticMap, interaction.id)?.action).toBeTruthy();

    const appendJournal = vi.fn((next, entry) => ({ ...next, journal: [...next.journal, entry] }));
    const resolved = chroniclesApplyContentAction(
      state,
      chroniclesContentDefinition(syntheticMap, interaction.id).action,
      { appendJournal },
    );

    expect(resolved.awake).toBe(true);
    expect(resolved.message).toBe('La cosa rara ha sido tocada.');
    expect(resolved.journal.at(-1)?.id).toBe('rare-touch');
  });

  it('keeps exits visible while deriving lock state and failure copy from requirements', () => {
    const lockedState = { x: 2, y: 2, awake: false };
    const lockedExit = chroniclesContentInteractions(lockedState, syntheticMap, tileAt)
      .find((entry) => entry.id === 'totally-new-exit');
    const definition = chroniclesContentDefinition(syntheticMap, 'totally-new-exit');

    expect(lockedExit).toEqual(expect.objectContaining({
      label: 'Mirar puerta',
      locked: true,
      x: 3,
      y: 2,
    }));
    expect(chroniclesContentLockedMessage(lockedState, definition)).toBe('Primero despierta la sala.');

    const openState = { ...lockedState, awake: true };
    expect(chroniclesRequirementsMet(openState, definition.requirements)).toBe(true);
    expect(chroniclesContentInteractions(openState, syntheticMap, tileAt))
      .toContainEqual(expect.objectContaining({ id: 'totally-new-exit', label: 'Salir', locked: false }));
  });

  it('supports reusable reward effects without knowing enemy ids', () => {
    const refilled = vi.fn((state) => ({ ...state, refilled: true }));
    const state = {
      relic: false,
      party: [
        { id: 'a', hp: 1, maxHp: 3 },
        { id: 'b', hp: 0, maxHp: 3 },
      ],
    };

    const next = chroniclesApplyContentEffects(state, [
      { type: 'set', key: 'relic', value: true },
      { type: 'heal-party', amount: 1 },
      { type: 'refill-class-abilities' },
    ], { refillClassAbilities: refilled });

    expect(next.relic).toBe(true);
    expect(next.party).toEqual([
      { id: 'a', hp: 2, maxHp: 3 },
      { id: 'b', hp: 0, maxHp: 3 },
    ]);
    expect(next.refilled).toBe(true);
    expect(refilled).toHaveBeenCalledOnce();
  });

  it('tracks authored inventory and quest state across chained adventure effects', () => {
    const started = chroniclesApplyContentEffects({}, [
      {
        type: 'start-quest',
        questId: 'blind-king-key',
        title: 'La llave del rey ciego',
        objective: 'Encuentra la llave ennegrecida',
        order: 10,
      },
      {
        type: 'grant-item',
        itemId: 'charred-key',
        name: 'Llave ennegrecida',
        description: 'Abre algo que probablemente debía seguir cerrado.',
      },
    ]);

    expect(chroniclesActiveQuest(started)).toMatchObject({
      id: 'blind-king-key',
      status: 'active',
      objective: 'Encuentra la llave ennegrecida',
    });
    expect(chroniclesInventoryEntries(started)).toEqual([
      expect.objectContaining({ id: 'charred-key', quantity: 1 }),
    ]);
    expect(chroniclesRequirementsMet(started, [
      { itemId: 'charred-key' },
      { questId: 'blind-king-key', questStatus: 'active' },
    ])).toBe(true);

    const advanced = chroniclesApplyContentEffects(started, [
      {
        type: 'advance-quest',
        questId: 'blind-king-key',
        objective: 'Busca la puerta que no figura en el plano',
      },
      { type: 'consume-item', itemId: 'charred-key' },
      { type: 'complete-quest', questId: 'blind-king-key' },
    ]);

    expect(chroniclesInventoryEntries(advanced)).toEqual([]);
    expect(chroniclesActiveQuest(advanced)).toBeNull();
    expect(chroniclesQuestEntries(advanced, 'completed')).toEqual([
      expect.objectContaining({
        id: 'blind-king-key',
        status: 'completed',
        objective: 'Busca la puerta que no figura en el plano',
      }),
    ]);
    expect(chroniclesRequirementsMet(advanced, [{ itemId: 'charred-key' }])).toBe(false);
    expect(chroniclesRequirementsMet(advanced, [
      { questId: 'blind-king-key', questStatus: 'completed' },
    ])).toBe(true);
  });
});

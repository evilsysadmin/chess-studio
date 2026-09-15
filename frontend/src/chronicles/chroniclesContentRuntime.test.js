import { describe, expect, it, vi } from 'vitest';
import {
  chroniclesApplyContentAction,
  chroniclesApplyContentEffects,
  chroniclesContentDefinition,
  chroniclesContentInteractions,
  chroniclesContentLockedMessage,
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
});

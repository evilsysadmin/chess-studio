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


// Campaign gates use x/y coordinates so there is no arbitrary marker tile.
// They remain usable from the adjacent tile (or on arrival), but not through
// solid geometry or from a diagonal.
describe('Chronicles authored overworld coordinate gates', () => {
  const gate = {
    id: 'road-west-gate', kind: 'exit', x: 2, y: 1,
    requiresReturn: true, openLabel: 'Volver al pueblo',
    lockedLabel: 'Camino cerrado',
    requirements: [{ key: 'routeUnlocked', equals: true, message: 'Necesitas la autorización.' }],
    action: { effects: [{ type: 'transition-map', mapId: 'swordhaven-campaign' }] },
  };
  const map = { triggers: [], interactables: [], treasures: [], traps: [], exits: [gate] };
  const floor = (x, y) => (x >= 0 && y >= 0 && x < 5 && y < 5 ? '.' : '#');
  it('discovers and respects locked copy from adjacent, on-gate and distant cells', () => {
    const adjacent = { x: 2, y: 2, routeUnlocked: false };
    expect(chroniclesContentInteractions(adjacent, map, floor)).toContainEqual(expect.objectContaining({
      id: gate.id, locked: true, requiresReturn: true, direction: 'north',
    }));
    expect(chroniclesContentLockedMessage(adjacent, gate)).toBe('Necesitas la autorización.');
    expect(chroniclesContentInteractions({ ...adjacent, routeUnlocked: true }, map, floor))
      .toContainEqual(expect.objectContaining({ id: gate.id, locked: false, label: 'Volver al pueblo' }));
    expect(chroniclesContentInteractions({ x: 2, y: 1, routeUnlocked: true }, map, floor))
      .toContainEqual(expect.objectContaining({ id: gate.id, locked: false }));
    expect(chroniclesContentInteractions({ x: 1, y: 2, routeUnlocked: true }, map, floor)).toEqual([]);
    expect(chroniclesContentInteractions({ x: 2, y: 3, routeUnlocked: true }, map, floor)).toEqual([]);
  });
  it('does not expose a portal placed inside a wall', () => {
    expect(chroniclesContentInteractions({ x: 2, y: 2 }, map, () => '#')).toEqual([]);
  });
});


describe('Chronicles spatial traders and atomic exchanges', () => {
  const vendor = {
    id: 'swordhaven-quartermaster', kind: 'merchant', x: 3, y: 2,
    label: 'Comprar vendaje (3 monedas)',
    lockedLabel: 'Necesitas 3 monedas',
    requirements: [{ itemId: 'crown-coin', quantity: 3, message: 'Te faltan monedas.' }],
    action: { effects: [{
      type: 'exchange-item', costItemId: 'crown-coin', costQuantity: 3,
      itemId: 'field-bandage', name: 'Vendaje de campaña',
      description: 'Provisiones del camino.', quantity: 1,
    }] },
  };
  const map = { triggers: [], interactables: [vendor], treasures: [], traps: [], exits: [] };
  const tileAt = () => '.';

  it('locks an unaffordable merchant at its actual world tile with grounded feedback', () => {
    const state = { x: 3, y: 2, inventory: { 'crown-coin': { quantity: 2 } } };
    const [interaction] = chroniclesContentInteractions(state, map, tileAt);
    expect(interaction).toMatchObject({
      id: 'swordhaven-quartermaster', locked: true, label: 'Necesitas 3 monedas',
    });
    expect(chroniclesContentLockedMessage(state, vendor)).toBe('Te faltan monedas.');
    expect(chroniclesContentInteractions({ ...state, x: 2 }, map, tileAt)).toEqual([]);
    expect(chroniclesContentInteractions({
      ...state, inventory: { 'crown-coin': { quantity: 3 } },
    }, map, tileAt)[0]).toMatchObject({ locked: false, label: 'Comprar vendaje (3 monedas)' });
  });

  it('exchanges payment and merchandise in the same state transition and supports repeat sales', () => {
    const buy = vendor.action.effects;
    const state = { inventory: {
      'crown-coin': { id: 'crown-coin', name: 'Moneda', quantity: 7 },
    } };
    const first = chroniclesApplyContentEffects(state, buy);
    expect(chroniclesInventoryEntries(first)).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'field-bandage', quantity: 1 }),
      expect.objectContaining({ id: 'crown-coin', quantity: 4 }),
    ]));
    expect(chroniclesInventoryEntries(first)).toHaveLength(2);
    const second = chroniclesApplyContentEffects(first, buy);
    expect(second.inventory['field-bandage'].quantity).toBe(2);
    expect(second.inventory['crown-coin'].quantity).toBe(1);
    const denied = chroniclesApplyContentEffects(second, buy);
    expect(denied).toBe(second);
    expect(state.inventory).not.toHaveProperty('field-bandage');
  });

  it('rejects free, malformed or overflowing trades without changing the inventory', () => {
    const state = { inventory: { 'crown-coin': { id: 'crown-coin', quantity: 5 } } };
    const item = { itemId: 'field-bandage', name: 'Vendaje de campaña', quantity: 1 };
    for (const malformed of [
      { ...item, costItemId: 'crown-coin', costQuantity: 0 },
      { ...item, costItemId: 'crown-coin', costQuantity: -1 },
      { ...item, costItemId: 'crown-coin', costQuantity: 1.5 },
      { ...item, costItemId: 'crown-coin', costQuantity: 1, quantity: 0 },
      { ...item, costItemId: 'crown-coin', costQuantity: 1, quantity: 10000 },
      { ...item, costItemId: 'field-bandage', costQuantity: 1 },
      { ...item, costItemId: 'crown-coin', costQuantity: 6 },
    ]) {
      expect(chroniclesApplyContentEffects(state, [{ type: 'exchange-item', ...malformed }])).toBe(state);
    }
    const full = { inventory: {
      ...state.inventory,
      'field-bandage': { id: 'field-bandage', name: 'Vendaje de campaña', quantity: 9999 },
    } };
    expect(chroniclesApplyContentEffects(full, vendor.action.effects)).toBe(full);
  });
});

import { describe, expect, it } from 'vitest';
import { chroniclesReduce, createChroniclesState, chroniclesContextualContentAction } from '../chroniclesOfMatthias.js';
import { chroniclesApplyContentEffects, chroniclesGoldBalance } from './chroniclesContentRuntime.js';
import { chroniclesApplyRunCheckpoint, chroniclesRunCheckpointPayload } from './chroniclesRunCheckpoint.js';

const atDoor = (gold = 0, overrides = {}) => {
  const start = createChroniclesState('swordhaven-first-book', null, { rules: 'mm3' });
  const funded = gold ? chroniclesApplyContentEffects(start, [{ type: 'grant-gold', amount: gold }]) : start;
  return { ...funded, x: 7, y: 10, direction: 2, ...overrides };
};

describe('Chronicles · MM3 tavern', () => {
  it('enters through the real tavern door by walking into its wall, even with no gold', () => {
    const before = atDoor();
    expect(chroniclesContextualContentAction(before)).toMatchObject({
      id: 'first-book-healer', locked: false,
    });
    const inside = chroniclesReduce(before, 'forward');
    expect(inside.tavern?.id).toBe('first-book-healer');
    expect(inside.x).toBe(7);
    expect(inside.y).toBe(10);
    expect(chroniclesGoldBalance(inside)).toBe(0);
    expect(chroniclesReduce(inside, { type: 'tavern-use', choice: 'rest' }).message).toMatch(/monedas/);
    expect(chroniclesReduce(inside, 'tavern-close').tavern).toBeUndefined();
  });

  it('accepts F from the street, but rejects remote or wrong-facing tavern use', () => {
    const street = { ...atDoor(), y: 9 };
    expect(chroniclesReduce(street, 'interact').tavern?.id).toBe('first-book-healer');
    expect(chroniclesContextualContentAction({ ...street, y: 8 })).toBeNull();
    const inside = chroniclesReduce(atDoor(15), 'interact');
    const away = { ...inside, x: 9, y: 7 };
    expect(chroniclesReduce(away, { type: 'tavern-use', choice: 'food' })).toBe(away);
    expect(chroniclesReduce(inside, 'turn-left').tavern).toBeUndefined();
  });

  it('buys real provisions, serves paid drinks and refuses unaffordable orders without debiting', () => {
    let state = chroniclesReduce(atDoor(8), 'interact');
    state = chroniclesReduce(state, { type: 'tavern-use', choice: 'food' });
    expect(chroniclesGoldBalance(state)).toBe(5);
    expect(state.inventory['road-rations']?.quantity).toBe(1);
    state = chroniclesReduce({ ...state, party: state.party.map((member) => ({ ...member, hp: member.maxHp - 3 })) },
      { type: 'tavern-use', choice: 'drink' });
    expect(chroniclesGoldBalance(state)).toBe(3);
    expect(state.party.every((member) => member.hp === member.maxHp - 1)).toBe(true);
    const refused = chroniclesReduce(state, { type: 'tavern-use', choice: 'rest' });
    expect(chroniclesGoldBalance(refused)).toBe(3);
    expect(refused.party).toEqual(state.party);
  });

  it('rests using authored inn effects and round-trips purchases through a checkpoint without reopening UI', () => {
    let state = chroniclesReduce(atDoor(40, {
      party: createChroniclesState('swordhaven-first-book', null, { rules: 'mm3' }).party.map(
        (member) => ({ ...member, hp: Math.max(1, member.maxHp - 5) }),
      ),
    }), 'interact');
    const before = state.party.map((member) => member.hp);
    state = chroniclesReduce(state, { type: 'tavern-use', choice: 'rest' });
    expect(chroniclesGoldBalance(state)).toBe(35);
    expect(state.party.every((member, index) => member.hp >= before[index])).toBe(true);
    state = chroniclesReduce(state, { type: 'tavern-use', choice: 'food' });
    const restored = chroniclesApplyRunCheckpoint(
      createChroniclesState('swordhaven-first-book', null, { rules: 'mm3' }),
      chroniclesRunCheckpointPayload(state, 2),
    );
    expect(restored.inventory['road-rations']?.quantity).toBe(1);
    expect(chroniclesGoldBalance(restored)).toBe(32);
    expect(restored.tavern).toBeUndefined();
  });

  it('offers useful, repeatable rumors free of charge without creating loot or quest receipts', () => {
    const open = chroniclesReduce(atDoor(), 'interact');
    const spoken = chroniclesReduce(open, { type: 'tavern-use', choice: 'rumor' });
    expect(spoken.message).toMatch(/Camino de los Estandartes/);
    expect(spoken.tavern.rumorIndex).toBe(1);
    expect(spoken.turns).toBe(open.turns + 1);
    expect(chroniclesGoldBalance(spoken)).toBe(0);
    expect(spoken.inventory).toEqual(open.inventory);
  });
});

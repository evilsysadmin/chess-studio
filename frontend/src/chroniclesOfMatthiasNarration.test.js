import { describe, expect, it } from 'vitest';
import { chroniclesReduce, createChroniclesState } from './chroniclesOfMatthias.js';

describe('Chronicles sparse narration', () => {
  it('keeps the last meaningful message while turning or walking through ordinary floor', () => {
    const initial = createChroniclesState();
    const message = initial.message;

    // Routine navigation must not drown the last event that was worth narrating.
    const turned = chroniclesReduce(initial, 'turn-left');
    expect(turned.message).toBe(message);
    expect(turned.turns).toBe(initial.turns + 1);

    const restoredDirection = chroniclesReduce(turned, 'turn-right');
    expect(restoredDirection.message).toBe(message);
    const moved = chroniclesReduce(restoredDirection, 'forward');
    expect(moved.message).toBe(message);
    expect([moved.x, moved.y]).toEqual([2, 5]);
  });

  it('still speaks when something actually matters', () => {
    const blocked = chroniclesReduce(createChroniclesState(), 'backward');
    expect(blocked.message).toMatch(/pared/i);
  });
});

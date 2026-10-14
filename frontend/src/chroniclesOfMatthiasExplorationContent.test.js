import { describe, expect, it } from 'vitest';
import {
  chroniclesReduce,
  createChroniclesState,
} from './chroniclesOfMatthias.js';

function stateAt(x, y, overrides = {}) {
  return {
    ...createChroniclesState(),
    x,
    y,
    enemyHp: 0,
    ...overrides,
  };
}

describe('Chronicles exploration authored content', () => {
  it('uses the exploration narrative when the ancient sigil fires', () => {
    const state = stateAt(3, 5, { direction: 0, sigilAwake: false });
    const next = chroniclesReduce(state, 'forward');

    expect(next.sigilAwake).toBe(true);
    expect(next.message).toContain('El sello despierta');
    expect(next.journal.some((entry) => entry.id === 'sigil-awake')).toBe(true);
    expect(next.journal.some((entry) => entry.id === 'tactics-sigil-awake')).toBe(false);
  });

  it('uses the exploration lock copy when the black key is still missing', () => {
    const state = stateAt(3, 2, {
      direction: 0,
      sigilAwake: true,
      jailerHp: 0,
      scavengerHp: 0,
      blackGateKey: false,
    });
    const next = chroniclesReduce(state, 'forward');

    expect(next.phase).toBe('explore');
    expect(next.message).toContain('Llave Negra');
    expect(next.x).toBe(3);
    expect(next.y).toBe(2);
  });

  it('requires USAR on the sewers ladder after walking onto its exit tile', () => {
    const state = {
      ...createChroniclesState('swordhaven-sewers'),
      x: 1, y: 2, direction: 0,
    };
    const stepped = chroniclesReduce(state, 'forward');
    expect(stepped.mapId).toBe('swordhaven-sewers');
    expect([stepped.x, stepped.y]).toEqual([1, 1]);
    const used = chroniclesReduce(stepped, 'interact');
    expect(used.mapId).toBe('swordhaven-first-book');
    expect(used.phase).toBe('explore');
  });

  it('finishes standalone Chronicles only after USAR at the gate, without leaking Tactics travel', () => {
    const state = stateAt(3, 2, {
      direction: 0,
      sigilAwake: true,
      jailerHp: 0,
      scavengerHp: 0,
      blackGateKey: true,
    });
    const atGate = chroniclesReduce(state, 'forward');
    expect(atGate.phase).toBe('explore');
    expect([atGate.x, atGate.y]).toEqual([3, 1]);
    const next = chroniclesReduce(atGate, 'interact');

    expect(next.phase).toBe('escaped');
    expect(next.mapId).toBe('crypt-eight-squares');
    expect(next.message).toContain('Salida encontrada');
    expect(next.journal.some((entry) => entry.id === 'escape')).toBe(true);
    expect(next.journal.some((entry) => entry.id === 'tactics-black-gate-crossed')).toBe(false);
  });
});

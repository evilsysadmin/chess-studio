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

  it('finishes standalone Chronicles without leaking the Tactics map transition', () => {
    const state = stateAt(3, 2, {
      direction: 0,
      sigilAwake: true,
      jailerHp: 0,
      scavengerHp: 0,
      blackGateKey: true,
    });
    const next = chroniclesReduce(state, 'forward');

    expect(next.phase).toBe('escaped');
    expect(next.mapId).toBe('crypt-eight-squares');
    expect(next.message).toContain('Salida encontrada');
    expect(next.journal.some((entry) => entry.id === 'escape')).toBe(true);
    expect(next.journal.some((entry) => entry.id === 'tactics-black-gate-crossed')).toBe(false);
  });
});

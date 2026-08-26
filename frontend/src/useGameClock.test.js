import { describe, expect, it } from 'vitest';
import { activeClockColor, fallenClockColor } from './useGameClock.js';

describe('game clock orchestration', () => {
  it('durante la espera de CPU cobra tiempo al bando contrario al humano', () => {
    expect(activeClockColor({ busy: true, humanColor: 'w', turn: 'w' })).toBe('b');
    expect(activeClockColor({ busy: false, humanColor: 'w', turn: 'b' })).toBe('b');
  });

  it('la bandera identifica el primer reloj agotado sin inventar caída si ambos siguen vivos', () => {
    expect(fallenClockColor(0, 12)).toBe('w');
    expect(fallenClockColor(20, -0.1)).toBe('b');
    expect(fallenClockColor(20, 12)).toBeNull();
  });
});

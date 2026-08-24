import { describe, expect, it } from 'vitest';
import { Chess } from 'chess.js';
import { immobilityReason, isKingSafetyIllegalAttempt } from './moveAvailability.js';

describe('immobilityReason', () => {
  it('explica el caballo de c6 clavado por Bb5 contra el rey de e8', () => {
    const chess = new Chess('4k3/8/2n5/1B6/8/8/8/4K3 b - - 0 1');
    expect(chess.moves({ square: 'c6' })).toHaveLength(0);
    expect(immobilityReason(chess, 'c6', 'b')).toEqual({
      kind: 'pinned',
      text: 'Clavada al rey: si mueves esa pieza, dejas a tu rey en jaque.',
    });
  });

  it('no muestra aviso si la pieza sí tiene movimientos', () => {
    const chess = new Chess();
    expect(immobilityReason(chess, 'g1', 'w')).toBeNull();
  });

  it('distingue una pieza simplemente bloqueada de una clavada', () => {
    const chess = new Chess('4k3/8/8/8/8/p7/P7/4K3 w - - 0 1');
    expect(immobilityReason(chess, 'a2', 'w')).toMatchObject({ kind: 'blocked' });
  });
});


describe('isKingSafetyIllegalAttempt', () => {
  it('detecta un intento lateral de una pieza absolutamente clavada aunque tenga algún movimiento legal sobre la línea', () => {
    const chess = new Chess('4r1k1/8/8/8/8/8/4R3/4K3 w - - 0 1');
    expect(chess.moves({ square: 'e2' }).length).toBeGreaterThan(0);
    expect(isKingSafetyIllegalAttempt(chess, 'e2', 'd2', 'w')).toBe(true);
  });

  it('detecta al rey intentando entrar en una casilla adyacente atacada, pero no un click remoto cualquiera', () => {
    const chess = new Chess('4k3/8/8/8/8/8/3r4/4K3 w - - 0 1');
    expect(isKingSafetyIllegalAttempt(chess, 'e1', 'd1', 'w')).toBe(true);
    expect(isKingSafetyIllegalAttempt(chess, 'e1', 'a5', 'w')).toBe(false);
  });
});

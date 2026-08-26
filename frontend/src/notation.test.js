import { describe, expect, it } from 'vitest';
import { formatLongMove } from './notation.js';

describe('notación larga para principiantes', () => {
  it('muestra origen y destino del peón sin letra', () => {
    expect(formatLongMove({ piece: 'p', from: 'e2', to: 'e4' })).toBe('e2-e4');
  });

  it('usa x para capturas y letra inglesa de pieza', () => {
    expect(formatLongMove({ piece: 'n', from: 'f3', to: 'e5', captured: true })).toBe('Nf3xe5');
    expect(formatLongMove({ piece: 'q', from: 'd1', to: 'h5' })).toBe('Qd1-h5');
  });

  it('cubre rey, torre y alfil', () => {
    expect(formatLongMove({ piece: 'k', from: 'e1', to: 'g1' })).toBe('Ke1-g1');
    expect(formatLongMove({ piece: 'r', from: 'a1', to: 'a8' })).toBe('Ra1-a8');
    expect(formatLongMove({ piece: 'b', from: 'c1', to: 'h6' })).toBe('Bc1-h6');
  });

  it('falla cerrado con movimientos incompletos', () => {
    expect(formatLongMove(null)).toBe('');
    expect(formatLongMove({ from: 'e2' })).toBe('');
    expect(formatLongMove({ to: 'e4' })).toBe('');
  });
});

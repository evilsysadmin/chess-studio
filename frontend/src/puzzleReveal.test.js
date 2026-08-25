import { describe, expect, it } from 'vitest';
import { buildPuzzleReveal } from './puzzleReveal.js';

describe('buildPuzzleReveal', () => {
  it('compara la jugada del usuario con la preferida desde la misma posición', () => {
    const reveal = buildPuzzleReveal({
      fen: '4k3/8/8/8/8/8/4P3/4K3 w - - 0 1',
      played: 'e3',
      solution: ['e4'],
    });
    expect(reveal.played).toMatchObject({ from: 'e2', to: 'e3', san: 'e3', piece: 'P' });
    expect(reveal.preferred).toMatchObject({ from: 'e2', to: 'e4', san: 'e4', piece: 'P' });
    expect(reveal.displayFen).toBe('4k3/8/8/8/8/4P3/8/4K3 b - - 0 1');
    expect(reveal.line).toEqual(['e4']);
  });

  it('conserva la línea completa aunque sólo destaque su primera jugada', () => {
    const reveal = buildPuzzleReveal({
      fen: '4k3/8/8/8/8/8/4P3/4K3 w - - 0 1',
      solution: ['e4', 'Kd7', 'e5'],
    });
    expect(reveal.preferred).toMatchObject({ from: 'e2', to: 'e4' });
    expect(reveal.line).toEqual(['e4', 'Kd7', 'e5']);
    expect(reveal.played).toBeNull();
    expect(reveal.displayFen).toBe('4k3/8/8/8/8/8/4P3/4K3 w - - 0 1');
  });
});

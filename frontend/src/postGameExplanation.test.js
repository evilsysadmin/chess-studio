import { describe, expect, it } from 'vitest';
import { buildPlainPostGameExplanation } from './postGameExplanation.js';

describe('buildPlainPostGameExplanation', () => {
  it('explica jugada, alternativa y coste sin pedir narrativa remota', () => {
    expect(buildPlainPostGameExplanation({ played: 'Qh5', suggested: 'Nf3', loss: 184 })).toEqual([
      'En esa posición jugaste Qh5; el análisis prefería Nf3, con una diferencia aproximada de 184 cp.',
      expect.any(String),
    ]);
  });

  it('explica de forma concreta una alternativa forzante', () => {
    const lines = buildPlainPostGameExplanation({ played: 'a3', suggested: 'Qh7#', loss: 950 });
    expect(lines).toHaveLength(2);
    expect(lines[0]).toContain('950 cp');
    expect(lines[1]).toContain('mate inmediato');
  });

  it('no inventa coste cuando la muestra no lo trae', () => {
    const [summary] = buildPlainPostGameExplanation({ played: 'e4', suggested: 'Nf3' });
    expect(summary).toBe('En esa posición jugaste e4; el análisis prefería Nf3.');
  });
});

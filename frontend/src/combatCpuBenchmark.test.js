import { describe, expect, it } from 'vitest';
import { Chess } from 'chess.js';
import { BENCHMARK_CASES, structuralPass, runCombatCpuBenchmark } from '../bench/combatCpuBenchmark.mjs';

describe('Combat emergency CPU · benchmark reproducibility', () => {
  it.each(BENCHMARK_CASES)('$name preserves exact chess.js reply semantics', ({ fen }) => {
    const chess = new Chess(fen);
    expect(chess.moves().length).toBeGreaterThan(0);
    expect(structuralPass(fen, 'optimized')).toEqual(structuralPass(fen, 'legacy'));
  });

  it('reports a bounded fixture run without imposing flaky CI timing thresholds', () => {
    const report = runCombatCpuBenchmark({ iterations: 1, rounds: 1 });
    expect(report.results).toHaveLength(BENCHMARK_CASES.length);
    for (const entry of report.results) {
      expect(entry.legalMoves).toBeGreaterThan(0);
      expect(entry.structuralLegacyMedianMs).toBeGreaterThanOrEqual(0);
      expect(entry.structuralOptimizedMedianMs).toBeGreaterThanOrEqual(0);
      expect(entry.currentFullCpuMedianMs).toBeGreaterThanOrEqual(0);
      expect(entry.suggestion).toMatchObject({ from: expect.any(String), to: expect.any(String) });
    }
    expect(() => runCombatCpuBenchmark({ iterations: 0 })).toThrow();
  });
});

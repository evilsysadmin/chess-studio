import { describe, expect, it } from 'vitest';
import { Chess } from 'chess.js';
import { emergencyCombatCpuSuggestion } from './combatControllerSupport.js';
import { BASELINE_COMMIT, FULL_AB_CASES, benchmarkFullCombatCpu } from '../bench/combatCpuFullAB.mjs';

describe('Combat CPU · full historical-vs-current benchmark contract', () => {
  it('pins the actual historical baseline and uses capture-dense positions', () => {
    expect(BASELINE_COMMIT).toMatch(/^[a-f0-9]{40}$/);
    const cases = FULL_AB_CASES.filter(row => row.name.startsWith('dense-pawn-captures'));
    expect(cases).toHaveLength(2);
    for (const scenario of cases) {
      const chess = new Chess(scenario.fen);
      const moves = chess.moves({ verbose: true });
      expect(moves.filter(move => move.captured).length).toBeGreaterThanOrEqual(10);
    }
  });

  it('reports identical full-CPU choices without flaky time thresholds', () => {
    const report = benchmarkFullCombatCpu({
      historicalCpu: emergencyCombatCpuSuggestion, iterations: 1, rounds: 1,
      cases: FULL_AB_CASES.slice(0, 2),
    });
    expect(report.kind).toBe('combat-emergency-cpu-full-ab');
    expect(report.results).toHaveLength(2);
    for (const row of report.results) {
      expect(row.historicalMedianMs).toBeGreaterThanOrEqual(0);
      expect(row.currentMedianMs).toBeGreaterThanOrEqual(0);
      expect(row.selectedMove).toMatchObject({ from: expect.any(String), to: expect.any(String) });
    }
  });

  it('rejects a false A/B when the historical implementation chooses a different move', () => {
    expect(() => benchmarkFullCombatCpu({
      historicalCpu: () => ({ from: 'z9', to: 'z8' }),
      iterations: 1, rounds: 1, cases: FULL_AB_CASES.slice(0, 1),
    })).toThrow(/Behavioral mismatch/);
    expect(() => benchmarkFullCombatCpu({ historicalCpu: null })).toThrow();
    expect(() => benchmarkFullCombatCpu({
      historicalCpu: emergencyCombatCpuSuggestion, iterations: 0,
    })).toThrow(/Invalid A\/B workload/);
  });
});

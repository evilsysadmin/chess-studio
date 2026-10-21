#!/usr/bin/env node
/**
 * Comparative CPU-only structural benchmark for Combat's emergency fallback.
 *
 * "legacy" intentionally models only the previously redundant chess.js
 * operations (new board per candidate + twice generating the same replies).
 * It is NOT the old Combat evaluator, so the speedup is a structural
 * microbenchmark; end-to-end current fallback time is reported separately.
 *
 * Run: node frontend/bench/combatCpuBenchmark.mjs --iterations 25
 */
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { Chess } from 'chess.js';
import { createInitialRegistry } from '../src/combat.js';
import { emergencyCombatCpuSuggestion } from '../src/combatControllerSupport.js';

export const BENCHMARK_CASES = Object.freeze([
  { name: 'initial-dense', fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1' },
  { name: 'developed', fen: 'rnbqkbnr/pppp1ppp/8/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R b KQkq - 1 2' },
  { name: 'two-captures', fen: '7k/8/8/8/3q4/2P1P3/8/7K b - - 0 1' },
  { name: 'multiple-threats', fen: '7k/1r6/1p6/N7/2q5/8/8/7K b - - 0 1' },
]);

function fingerprint(replies) {
  let value = 2166136261 >>> 0;
  for (const move of replies) {
    const label = move.from + move.to + (move.promotion || '') + (move.captured || '');
    for (let i = 0; i < label.length; i++) {
      value = Math.imul(value ^ label.charCodeAt(i), 16777619) >>> 0;
    }
  }
  return value;
}

export function structuralPass(fen, mode) {
  if (mode !== 'legacy' && mode !== 'optimized') throw new Error('Expected legacy or optimized');
  const board = new Chess(fen);
  const legal = board.moves({ verbose: true });
  let checksum = 0;
  let captures = 0;
  for (const move of legal) {
    const probe = mode === 'legacy' ? new Chess(fen) : board;
    const played = probe.move({ from: move.from, to: move.to, promotion: move.promotion || 'q' });
    if (!played) throw new Error('Illegal candidate during benchmark');
    try {
      // The old helpers regenerated both identical lists, the new helper
      // shares one. Score BOTH reply traversals so semantic work is equal.
      const first = probe.moves({ verbose: true });
      const second = mode === 'legacy' ? probe.moves({ verbose: true }) : first;
      checksum = Math.imul(checksum ^ fingerprint(first) ^ fingerprint(second), 16777619) >>> 0;
      checksum = Math.imul(checksum ^ first.length ^ Number(probe.isCheck()), 16777619) >>> 0;
      if (move.captured) captures++;
    } finally {
      if (mode === 'optimized') probe.undo();
    }
  }
  if (mode === 'optimized' && board.fen() !== fen) throw new Error('Board was not restored');
  return { checksum, legalMoves: legal.length, captureMoves: captures };
}

function median(samples) {
  const values = [...samples].sort((a, b) => a - b);
  return values[Math.floor(values.length / 2)];
}
function timedBatch(fn, iterations) {
  let last;
  const begin = performance.now();
  for (let i = 0; i < iterations; i++) last = fn();
  return { ms: performance.now() - begin, result: last };
}

export function runCombatCpuBenchmark({ iterations = 25, rounds = 5 } = {}) {
  if (!Number.isSafeInteger(iterations) || iterations < 1 || iterations > 300
    || !Number.isSafeInteger(rounds) || rounds < 1 || rounds > 15) throw new Error('Invalid benchmark workload');
  const results = [];
  for (const scenario of BENCHMARK_CASES) {
    const before = structuralPass(scenario.fen, 'legacy');
    const after = structuralPass(scenario.fen, 'optimized');
    if (JSON.stringify(before) !== JSON.stringify(after)) throw new Error('Structural baseline mismatch: ' + scenario.name);

    const registry = createInitialRegistry(new Chess(scenario.fen));
    const current = () => emergencyCombatCpuSuggestion(scenario.fen, registry);
    const chosen = current();
    if (!chosen) throw new Error('No legal CPU suggestion: ' + scenario.name);
    for (let warm = 0; warm < 3; warm++) {
      structuralPass(scenario.fen, 'legacy');
      structuralPass(scenario.fen, 'optimized');
      current();
    }
    const baselineTimes = [], optimizedTimes = [], cpuTimes = [];
    for (let round = 0; round < rounds; round++) {
      const runs = round % 2
        ? ['optimized', 'legacy']
        : ['legacy', 'optimized'];
      for (const mode of runs) {
        const sample = timedBatch(() => structuralPass(scenario.fen, mode), iterations);
        (mode === 'legacy' ? baselineTimes : optimizedTimes).push(sample.ms / iterations);
      }
      const cpu = timedBatch(current, iterations);
      if (JSON.stringify(cpu.result) !== JSON.stringify(chosen)) throw new Error('Nondeterministic fallback: ' + scenario.name);
      cpuTimes.push(cpu.ms / iterations);
    }
    const legacyMs = median(baselineTimes);
    const optimizedMs = median(optimizedTimes);
    results.push({
      name: scenario.name, legalMoves: before.legalMoves, captures: before.captureMoves,
      structuralLegacyMedianMs: Number(legacyMs.toFixed(4)),
      structuralOptimizedMedianMs: Number(optimizedMs.toFixed(4)),
      structuralSpeedup: Number((legacyMs / optimizedMs).toFixed(3)),
      currentFullCpuMedianMs: Number(median(cpuTimes).toFixed(4)),
      checksum: before.checksum, suggestion: chosen,
    });
  }
  return {
    kind: 'combat-emergency-cpu-local',
    caution: 'Structural A/B models board/reply operations only; full CPU median is current version without historical A/B.',
    iterations, rounds, node: process.version, platform: process.platform, arch: process.arch, results,
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const idx = process.argv.indexOf('--iterations');
  const iterations = idx >= 0 ? Number(process.argv[idx + 1]) : 25;
  const out = runCombatCpuBenchmark({ iterations });
  process.stdout.write(JSON.stringify(out, null, 2) + '\n');
}

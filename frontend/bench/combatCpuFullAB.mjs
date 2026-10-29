#!/usr/bin/env node
/**
 * Full end-to-end Combat Chess emergency CPU A/B.
 *
 * The baseline is the actual historical module from immutable Git SHA
 * 58ac62a (before the three #5961/#5964/#5965 performance PRs).
 * Never mistake the existing structural microbenchmark for end-to-end A/B.
 *
 * CI materializes the historical module from:
 *   git show <pinned-sha>:frontend/src/combatControllerSupport.js
 * into frontend/src/combatCpuHistoricalBaseline.mjs (untracked).
 *
 * Run locally with that module:
 *   node frontend/bench/combatCpuFullAB.mjs --baseline-module frontend/src/combatCpuHistoricalBaseline.mjs
 */
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { Chess } from 'chess.js';
import { createInitialRegistry } from '../src/combat.js';
import { emergencyCombatCpuSuggestion as currentCpu } from '../src/combatControllerSupport.js';
import { BENCHMARK_CASES } from './combatCpuBenchmark.mjs';

export const BASELINE_COMMIT = '58ac62a57664607131f29f3dcfab44182dfa32fc';

// Both sides have ~14 legal pawn captures. Ordinary opening fixtures had 0.
export const FULL_AB_CASES = Object.freeze([
  ...BENCHMARK_CASES,
  { name: 'dense-pawn-captures-white', fen: '4k3/pppppppp/PPPPPPPP/8/8/8/8/4K3 w - - 0 1' },
  { name: 'dense-pawn-captures-black', fen: '4k3/pppppppp/PPPPPPPP/8/8/8/8/4K3 b - - 0 1' },
]);

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

function timed(fn, iterations, expectedMove) {
  const started = performance.now();
  for (let n = 0; n < iterations; n++) {
    const selected = fn();
    if (selected?.from !== expectedMove.from || selected?.to !== expectedMove.to ||
      (selected?.promotion || '') !== (expectedMove.promotion || '')) {
      throw new Error('CPU changed its decision during benchmarking');
    }
  }
  return (performance.now() - started) / iterations;
}

export function benchmarkFullCombatCpu({
  historicalCpu,
  iterations = 8,
  rounds = 5,
  cases = FULL_AB_CASES,
} = {}) {
  if (typeof historicalCpu !== 'function') throw new Error('Historical CPU implementation is required');
  if (!Number.isSafeInteger(iterations) || iterations < 1 || iterations > 150 ||
      !Number.isSafeInteger(rounds) || rounds < 1 || rounds > 15) {
    throw new Error('Invalid A/B workload');
  }
  const results = [];
  for (const scenario of cases) {
    const chess = new Chess(scenario.fen);
    const legal = chess.moves({ verbose: true });
    if (!legal.length) throw new Error('Benchmark FEN has no legal moves: ' + scenario.name);
    const captures = legal.filter(move => Boolean(move.captured)).length;
    const registry = createInitialRegistry(chess);
    const baseline = () => historicalCpu(scenario.fen, registry);
    const current = () => currentCpu(scenario.fen, registry);
    const chosen = baseline();
    if (!chosen) throw new Error('Historical CPU returned no move: ' + scenario.name);
    const updated = current();
    if (JSON.stringify(chosen) !== JSON.stringify(updated)) {
      throw new Error('Behavioral mismatch in ' + scenario.name +
        ': historical=' + JSON.stringify(chosen) + ', current=' + JSON.stringify(updated));
    }
    for (let i = 0; i < 3; i++) { baseline(); current(); }
    const oldSamples = [], newSamples = [];
    for (let round = 0; round < rounds; round++) {
      // Alternate A/B versus B/A to reduce warm-cache and runner-drift bias.
      if (round % 2 === 0) {
        oldSamples.push(timed(baseline, iterations, chosen));
        newSamples.push(timed(current, iterations, chosen));
      } else {
        newSamples.push(timed(current, iterations, chosen));
        oldSamples.push(timed(baseline, iterations, chosen));
      }
    }
    const previous = median(oldSamples);
    const next = median(newSamples);
    results.push({
      name: scenario.name,
      legalMoves: legal.length,
      captures,
      historicalMedianMs: Number(previous.toFixed(4)),
      currentMedianMs: Number(next.toFixed(4)),
      fullCpuSpeedup: Number((previous / next).toFixed(3)),
      selectedMove: chosen,
    });
  }
  return {
    kind: 'combat-emergency-cpu-full-ab',
    baselineCommit: BASELINE_COMMIT,
    methodology: 'Historical full emergency CPU vs current full emergency CPU, same FEN/registry and identical decisions, alternating A/B and B/A, medians; runner timings not CI gates.',
    iterations, rounds,
    node: process.version, platform: process.platform, arch: process.arch,
    results,
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const flag = process.argv.indexOf('--baseline-module');
  const arg = flag >= 0 ? process.argv[flag + 1] : '';
  if (!arg || arg.startsWith('--')) throw new Error('Provide --baseline-module with the historical Git module');
  const count = process.argv.indexOf('--iterations');
  const iterations = count >= 0 ? Number(process.argv[count + 1]) : 8;
  const historical = await import(pathToFileURL(path.resolve(arg)).href);
  const report = benchmarkFullCombatCpu({ historicalCpu: historical.emergencyCombatCpuSuggestion, iterations });
  process.stdout.write(JSON.stringify(report, null, 2) + '\n');
}

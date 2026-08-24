import { describe, expect, it } from 'vitest';
import {
  OBSERVABILITY_LATENCY_VIEWS,
  isObservabilityLatencyView,
  observabilityLatencyTitle,
} from './observabilityLatency.js';

describe('observability latency views', () => {
  it('supports p50, p95, p99 and the combined view', () => {
    expect(OBSERVABILITY_LATENCY_VIEWS).toEqual(['p50', 'p95', 'p99', 'all']);
    expect(isObservabilityLatencyView('p50')).toBe(true);
    expect(isObservabilityLatencyView('p95')).toBe(true);
    expect(isObservabilityLatencyView('p99')).toBe(true);
    expect(isObservabilityLatencyView('all')).toBe(true);
    expect(isObservabilityLatencyView('p90')).toBe(false);
  });

  it('builds stable chart titles without coupling tests to component source text', () => {
    expect(observabilityLatencyTitle('Latencia API', 'p50')).toBe('Latencia API · p50');
    expect(observabilityLatencyTitle('Latencia API', 'all')).toBe('Latencia API · p50 / p95 / p99');
    expect(observabilityLatencyTitle('Latencia Workers AI', 'p99')).toBe('Latencia Workers AI · p99');
    expect(observabilityLatencyTitle('Latencia Workers AI', 'nonsense')).toBe('Latencia Workers AI · p95');
  });
});

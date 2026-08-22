import { describe, expect, it, vi } from 'vitest';
import { aiNarrativeStatus, fetchAiNarrativeMetrics, formatAiMetric } from './aiMetrics.js';

describe('AI narrative admin metrics', () => {
  it('no hace request sin JWT', async () => {
    const fetchImpl = vi.fn();
    expect(await fetchAiNarrativeMetrics({ fetchImpl })).toBeNull();
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('normaliza el payload sin conservar texto, facts o usuarios', async () => {
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        samples: 25,
        cloudflare_percent: 96,
        fallback_percent: 4,
        cloudflare_p95_ms: 812.4,
        reasons: { ok: 24, timeout: 1 },
        last_event_at: 1760000000,
        enabled: true,
        circuit: {
          open: false,
          seconds_remaining: 0,
          consecutive_failures: 1,
          open_count: 2,
          failure_threshold: 5,
        },
        prompt: 'NO',
        username: 'NO',
      }),
    }));
    const result = await fetchAiNarrativeMetrics({ token: 'jwt', fetchImpl });
    expect(result).toEqual({
      samples: 25,
      cloudflarePercent: 96,
      fallbackPercent: 4,
      p95Ms: 812.4,
      reasons: { ok: 24, timeout: 1 },
      lastEventAt: 1760000000,
      enabled: true,
      circuit: {
        open: false,
        secondsRemaining: 0,
        consecutiveFailures: 1,
        openCount: 2,
        halfOpen: false,
        failureThreshold: 5,
      },
    });
    expect(JSON.stringify(result)).not.toContain('prompt');
    expect(JSON.stringify(result)).not.toContain('username');
    expect(aiNarrativeStatus(result)).toBe('Operativo');
  });

  it('expone kill switch y circuito abierto de forma simple', () => {
    expect(aiNarrativeStatus({ enabled:false, circuit:{ open:false } })).toBe('Desactivado');
    expect(aiNarrativeStatus({ enabled:true, circuit:{ open:true } })).toBe('Circuito abierto');
  });

  it('falla cerrado a null y formatea ausencia', async () => {
    const fetchImpl = vi.fn(async () => ({ ok: false, status: 403 }));
    expect(await fetchAiNarrativeMetrics({ token: 'jwt', fetchImpl })).toBeNull();
    expect(formatAiMetric(null, '%')).toBe('—');
  });
});

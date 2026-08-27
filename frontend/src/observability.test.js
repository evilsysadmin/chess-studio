import { describe, expect, it, vi } from 'vitest';
import { burnRateForSlo, errorBudgetForSlo, evaluateProductSlos, evaluateReleaseHealth, fetchAdminObservability, formatDuration, observabilityRangeForPreset, observabilitySampleQuality, runObservabilityProbe, runTempoTraceProbe, summarizeAdminUsers, summarizeObservabilityHealth } from './observability.js';

describe('admin observability helpers', () => {
  it('no consulta sin JWT y acepta sólo payload técnico', async () => {
    const fetchImpl = vi.fn();
    expect(await fetchAdminObservability({ fetchImpl })).toBeNull();
    expect(fetchImpl).not.toHaveBeenCalled();

    const technical = { http: { last_1h: { samples: 12 } }, database: { status: 'ok', latency_ms: 3.2 } };
    const okFetch = vi.fn(async () => ({ ok: true, json: async () => technical }));
    expect(await fetchAdminObservability({ token: 'jwt', from: '2026-08-20T00:00:00Z', to: '2026-08-21T00:00:00Z', fetchImpl: okFetch })).toEqual(technical);
    const [url, options] = okFetch.mock.calls[0];
    expect(options.headers['X-Request-ID']).toBeTruthy();
    expect(options.headers['X-Client-Release']).toBeTruthy();
    expect(url).toContain('from_time=2026-08-20T00%3A00%3A00Z');
    expect(url).toContain('to_time=2026-08-21T00%3A00%3A00Z');
  });

  it('el probe OTLP comprueba logs, métricas y trazas con una sola acción', async () => {
    const fetchImpl = vi.fn();
    expect(await runObservabilityProbe({ fetchImpl })).toEqual({ ok: false, reason: 'missing_token' });
    const okFetch = vi.fn(async () => ({ ok: true, json: async () => ({ ok: true, traceId: 'deadbeef', signals: { logs: { flushed: true }, metrics: { flushed: true }, traces: { flushed: true } } }) }));
    const result = await runObservabilityProbe({ token: 'jwt', fetchImpl: okFetch });
    expect(result.signals.logs.flushed).toBe(true);
    expect(result.signals.metrics.flushed).toBe(true);
    expect(result.signals.traces.flushed).toBe(true);
    expect(okFetch.mock.calls[0][0]).toContain('/admin/observability/probe');
  });

  it('el probe de Tempo exige JWT y devuelve el trace id técnico sin inventarlo', async () => {
    const fetchImpl = vi.fn();
    expect(await runTempoTraceProbe({ fetchImpl })).toEqual({ ok: false, reason: 'missing_token' });
    expect(fetchImpl).not.toHaveBeenCalled();

    const okFetch = vi.fn(async () => ({ ok: true, json: async () => ({ ok: true, traceId: 'abc123', sampled: true, flushed: true }) }));
    expect(await runTempoTraceProbe({ token: 'jwt', fetchImpl: okFetch })).toMatchObject({ ok: true, traceId: 'abc123' });
    const [url, options] = okFetch.mock.calls[0];
    expect(url).toContain('/admin/observability/trace-probe');
    expect(options.method).toBe('POST');
    expect(options.headers.Authorization).toBe('Bearer jwt');
  });

  it('resuelve presets y fechas personalizadas a un rango real', () => {
    const now = new Date('2026-08-24T00:30:00+02:00');
    const short = observabilityRangeForPreset('15m', '', '', now);
    expect(new Date(short.to).getTime() - new Date(short.from).getTime()).toBe(15 * 60 * 1000);
    const twoHours = observabilityRangeForPreset('2h', '', '', now);
    expect(new Date(twoHours.to).getTime() - new Date(twoHours.from).getTime()).toBe(2 * 60 * 60 * 1000);
    const day = observabilityRangeForPreset('24h', '', '', now);
    expect(new Date(day.to).getTime() - new Date(day.from).getTime()).toBe(24 * 60 * 60 * 1000);

    const custom = observabilityRangeForPreset('custom', '2026-08-01', '2026-08-03', now);
    expect(custom.from).toBe(new Date('2026-08-01T00:00:00').toISOString());
    expect(new Date(custom.to).getTime()).toBeGreaterThan(new Date(custom.from).getTime());
  });

  it('agrega usuarios sin identidad ni contenido de partidas', () => {
    const summary = summarizeAdminUsers([
      { username: 'admin', totalGames: 99, clientRelease: 'vX' },
      { username: 'ana', totalGames: 5, combatBattles: 2, foreground: true, presence: 'online', clientRelease: 'v16.6dm23' },
      { username: 'bob', totalGames: 3, combatBattles: 1, foreground: false, presence: 'idle', clientRelease: 'v16.6dm22' },
      { username: 'cora', totalGames: 0, foreground: false, presence: 'online', clientRelease: 'v16.6dm22' },
    ], 'admin');
    expect(summary).toEqual({
      registered: 3,
      foreground: 1,
      online: 1,
      idle: 2,
      totalGames: 8,
      combatBattles: 3,
      releases: { 'v16.6dm23': 1, 'v16.6dm22': 2 },
    });
    expect(JSON.stringify(summary)).not.toContain('ana');
    expect(JSON.stringify(summary)).not.toContain('bob');
  });

  it('formatea uptime compacto', () => {
    expect(formatDuration(45)).toBe('45 s');
    expect(formatDuration(3900)).toBe('1 h 5 min');
  });
  it('resume la salud del admin sin exponer identidad y degrada ante 5xx o Mongo caído', () => {
    const healthy = summarizeObservabilityHealth({
      history: {
        http: { p95_ms: 125, error_5xx_percent: 0 },
        ai: { cloudflare_percent: 98.5 },
      },
      database: { status: 'ok' },
    }, [
      { username: 'admin', presence: 'online' },
      { username: 'ana', presence: 'online', foreground: true },
      { username: 'bob', presence: 'idle' },
    ], 'admin');
    expect(healthy).toEqual({
      status: 'operational',
      statusLabel: 'Operativo',
      apiP95Ms: 125,
      error5xxPercent: 0,
      databaseLabel: 'Mongo OK',
      aiCloudflarePercent: 98.5,
      onlineUsers: 1,
    });

    const degraded = summarizeObservabilityHealth({
      history: { http: { p95_ms: 900, error_5xx_percent: 1.2 }, ai: {} },
      database: { status: 'down' },
    }, [], null);
    expect(degraded.status).toBe('degraded');
    expect(degraded.statusLabel).toBe('Degradado');
    expect(degraded.databaseLabel).toBe('Mongo DOWN');
  });

});


describe('observabilitySampleQuality', () => {
  it('no deja que una muestra minúscula parezca evidencia sólida', () => {
    expect(observabilitySampleQuality(0)).toMatchObject({ level: 'none', samples: 0 });
    expect(observabilitySampleQuality(3, 5)).toMatchObject({ level: 'low', samples: 3, minimum: 5 });
    expect(observabilitySampleQuality(20)).toMatchObject({ level: 'enough', samples: 20 });
  });
});


describe('product SLOs', () => {
  it('evalúa disponibilidad y p95 con objetivos explícitos', () => {
    const met = evaluateProductSlos({ history: { http: { samples: 120, error_5xx_percent: 0.2, p95_ms: 410 } } });
    expect(met).toMatchObject({ status: 'met', availabilityPercent: 99.8, availabilityMet: true, latencyMet: true });

    const missed = evaluateProductSlos({ history: { http: { samples: 120, error_5xx_percent: 1.1, p95_ms: 910 } } });
    expect(missed).toMatchObject({ status: 'missed', availabilityMet: false, latencyMet: false });
  });

  it('no pinta verde cuando aún no hay muestra útil', () => {
    expect(evaluateProductSlos({ history: { http: { samples: 0 } } }).status).toBe('unknown');
  });
});


describe('error budget + release health', () => {
  it('calcula consumo de error budget sin fingir precisión con muestra pequeña', () => {
    expect(errorBudgetForSlo({ history: { http: { samples: 10, status_5xx: 0 } } }).status).toBe('unknown');
    const healthy = errorBudgetForSlo({ history: { http: { samples: 1000, status_5xx: 1 } } });
    expect(healthy).toMatchObject({ status: 'healthy', consumedPercent: 20, remainingPercent: 80 });
    const exhausted = errorBudgetForSlo({ history: { http: { samples: 1000, status_5xx: 8 } } });
    expect(exhausted.status).toBe('exhausted');
    expect(exhausted.consumedPercent).toBeGreaterThan(100);
  });

  it('evalúa la release actual con su tráfico real y detecta regresiones', () => {
    const runtime = { history: { http: { releases: [
      { release: 'vOld', requests: 200, error_5xx_percent: 0, p95_ms: 300 },
      { release: 'vNew', requests: 100, error_5xx_percent: 2, p95_ms: 1200 },
    ] } } };
    expect(evaluateReleaseHealth(runtime, 'vNew')).toMatchObject({ status: 'regression', requests: 100 });
    expect(evaluateReleaseHealth(runtime, 'vMissing').status).toBe('unknown');
  });
});


describe('SLO burn rate', () => {
  it('detecta consumo rápido con ventanas 15m/1h sin fingir precisión', () => {
    expect(burnRateForSlo({ http: { last_15m: { samples: 3, error_5xx_percent: 50 }, last_1h: { samples: 5, error_5xx_percent: 50 } } }).status).toBe('unknown');
    const healthy = burnRateForSlo({ http: { last_15m: { samples: 1000, error_5xx_percent: 0.1 }, last_1h: { samples: 2000, error_5xx_percent: 0.1 } } });
    expect(healthy).toMatchObject({ status: 'healthy' });
    expect(healthy.short.burnRate).toBe(0.2);
    const fast = burnRateForSlo({ http: { last_15m: { samples: 100, error_5xx_percent: 8 }, last_1h: { samples: 500, error_5xx_percent: 4 } } });
    expect(fast.status).toBe('fast');
  });
});

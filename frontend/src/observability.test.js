import { describe, expect, it, vi } from 'vitest';
import { fetchAdminObservability, formatDuration, observabilityRangeForPreset, summarizeAdminUsers } from './observability.js';

describe('admin observability helpers', () => {
  it('no consulta sin JWT y acepta sólo payload técnico', async () => {
    const fetchImpl = vi.fn();
    expect(await fetchAdminObservability({ fetchImpl })).toBeNull();
    expect(fetchImpl).not.toHaveBeenCalled();

    const technical = { http: { last_1h: { samples: 12 } }, database: { status: 'ok', latency_ms: 3.2 } };
    const okFetch = vi.fn(async () => ({ ok: true, json: async () => technical }));
    expect(await fetchAdminObservability({ token: 'jwt', from: '2026-08-20T00:00:00Z', to: '2026-08-21T00:00:00Z', fetchImpl: okFetch })).toEqual(technical);
    const [url] = okFetch.mock.calls[0];
    expect(url).toContain('from_time=2026-08-20T00%3A00%3A00Z');
    expect(url).toContain('to_time=2026-08-21T00%3A00%3A00Z');
  });

  it('resuelve presets y fechas personalizadas a un rango real', () => {
    const now = new Date('2026-08-24T00:30:00+02:00');
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
    ], 'admin');
    expect(summary).toEqual({
      registered: 2,
      foreground: 1,
      online: 1,
      idle: 1,
      totalGames: 8,
      combatBattles: 3,
      releases: { 'v16.6dm23': 1, 'v16.6dm22': 1 },
    });
    expect(JSON.stringify(summary)).not.toContain('ana');
    expect(JSON.stringify(summary)).not.toContain('bob');
  });

  it('formatea uptime compacto', () => {
    expect(formatDuration(45)).toBe('45 s');
    expect(formatDuration(3900)).toBe('1 h 5 min');
  });
});

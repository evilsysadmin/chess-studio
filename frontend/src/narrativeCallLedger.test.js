import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  clearNarrativeCallLedger,
  loadNarrativeCallLedger,
  recordNarrativeCall,
} from './narrativeCallLedger.js';
import { requestRemoteNarrative } from './narrativeRemote.js';

describe('narrative call ledger', () => {
  beforeEach(() => {
    clearNarrativeCallLedger();
  });

  it('keeps only bounded sanitized operational metadata', () => {
    for (let index = 0; index < 90; index += 1) {
      recordNarrativeCall({
        eventType: `task-${index}`,
        requestKind: 'default',
        provider: 'cloudflare',
        inputChars: 100 + index,
        outputChars: 20,
        ok: true,
        at: `2026-09-11T12:${String(index % 60).padStart(2, '0')}:00.000Z`,
        prompt: 'NO DEBE GUARDARSE',
        facts: { fen: 'NO DEBE GUARDARSE' },
        text: 'NO DEBE GUARDARSE',
      });
    }

    const rows = loadNarrativeCallLedger();
    expect(rows).toHaveLength(80);
    expect(rows[0].eventType).toBe('task-10');
    expect(rows.at(-1).eventType).toBe('task-89');
    expect(JSON.stringify(rows)).not.toContain('NO DEBE GUARDARSE');
    expect(Object.keys(rows[0]).sort()).toEqual([
      'at',
      'eventType',
      'inputChars',
      'ok',
      'outputChars',
      'provider',
      'requestKind',
    ]);
  });

  it('records provider and approximate sizes without storing narrative contents', async () => {
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      json: async () => ({ provider: 'cloudflare', text: 'Respuesta privada que no debe persistirse' }),
    }));

    const text = await requestRemoteNarrative({
      eventType: 'post_game_autopsy',
      requestKind: 'analysis',
      facts: { fen: 'secret-fen', san: 'Qd4' },
    }, { token: 'jwt', fetchImpl });

    expect(text).toBe('Respuesta privada que no debe persistirse');
    const [row] = loadNarrativeCallLedger();
    expect(row).toMatchObject({
      eventType: 'post_game_autopsy',
      requestKind: 'analysis',
      provider: 'cloudflare',
      ok: true,
      outputChars: text.length,
    });
    expect(row.inputChars).toBeGreaterThan(0);
    const serialized = JSON.stringify(row);
    expect(serialized).not.toContain('secret-fen');
    expect(serialized).not.toContain('Qd4');
    expect(serialized).not.toContain('Respuesta privada');
    expect(serialized).not.toContain('jwt');
  });

  it('distinguishes backend fallback and HTTP failure without leaking response text', async () => {
    const localFetch = vi.fn(async () => ({
      ok: true,
      json: async () => ({ provider: 'local', text: 'fallback backend privado' }),
    }));
    const failedFetch = vi.fn(async () => ({ ok: false, status: 503 }));

    expect(await requestRemoteNarrative({ eventType: 'mate', facts: { fen: 'private' } }, { token: 'jwt', fetchImpl: localFetch })).toBeNull();
    expect(await requestRemoteNarrative({ eventType: 'blunder', facts: { san: 'Qa4' } }, { token: 'jwt', fetchImpl: failedFetch })).toBeNull();

    const rows = loadNarrativeCallLedger();
    expect(rows.map((row) => [row.provider, row.ok])).toEqual([
      ['local', false],
      ['http-503', false],
    ]);
    expect(JSON.stringify(rows)).not.toContain('fallback backend privado');
    expect(JSON.stringify(rows)).not.toContain('private');
    expect(JSON.stringify(rows)).not.toContain('Qa4');
  });
});

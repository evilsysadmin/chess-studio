import { beforeEach, describe, expect, it, vi } from 'vitest';
import { clearStorageMemoryFallback } from './safeStorage.js';
import { clearLocalUserState, DERIVED_LOCAL_CACHE_KEYS } from './profileKeys.js';
import {
  NARRATIVE_CALL_LEDGER_KEY,
  loadNarrativeCallLedger,
  recordNarrativeCall,
} from './narrativeCallLedger.js';
import { requestRemoteNarrative } from './narrativeRemote.js';

describe('narrative call ledger', () => {
  beforeEach(() => {
    localStorage.clear();
    clearStorageMemoryFallback();
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
    }, { token: 'SECRET-JWT', fetchImpl });

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
    const serialized = localStorage.getItem(NARRATIVE_CALL_LEDGER_KEY);
    for (const secret of ['secret-fen', 'Qd4', 'Respuesta privada', 'SECRET-JWT']) {
      expect(serialized).not.toContain(secret);
    }
  });

  it('distinguishes backend fallback and HTTP failure without leaking response text', async () => {
    const localFetch = vi.fn(async () => ({
      ok: true,
      json: async () => ({ provider: 'local', text: 'fallback backend privado' }),
    }));
    const failedFetch = vi.fn(async () => ({ ok: false, status: 503 }));

    expect(await requestRemoteNarrative({ eventType: 'mate', facts: { fen: 'private-fen' } }, { token: 'jwt-a', fetchImpl: localFetch })).toBeNull();
    expect(await requestRemoteNarrative({ eventType: 'blunder', facts: { san: 'Qa4' } }, { token: 'jwt-b', fetchImpl: failedFetch })).toBeNull();

    const rows = loadNarrativeCallLedger();
    expect(rows.map((row) => [row.provider, row.ok])).toEqual([
      ['local', false],
      ['http-503', false],
    ]);
    const serialized = JSON.stringify(rows);
    for (const secret of ['fallback backend privado', 'private-fen', 'Qa4', 'jwt-a', 'jwt-b']) {
      expect(serialized).not.toContain(secret);
    }
  });

  it('stays local-only and is cleared with local user state', () => {
    expect(DERIVED_LOCAL_CACHE_KEYS).toContain(NARRATIVE_CALL_LEDGER_KEY);
    recordNarrativeCall({ eventType: 'training_plan', provider: 'cloudflare', ok: true });
    expect(loadNarrativeCallLedger()).toHaveLength(1);

    clearLocalUserState();
    expect(loadNarrativeCallLedger()).toEqual([]);
  });
});

import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_CHRONICLES_MAP_ID,
  chroniclesClearRuntimeMapDefinitions,
  chroniclesMapById,
} from './chroniclesMapCatalog.js';
import { chroniclesBootstrapTacticsWorld } from './chroniclesGameBootstrap.js';

function remoteEnvelope(title = 'Cripta remota') {
  return {
    source: 'remote',
    seed: 0,
    instanceId: 'a'.repeat(24),
    manifestRevision: 'b'.repeat(64),
    map: {
      ...JSON.parse(JSON.stringify(chroniclesMapById(DEFAULT_CHRONICLES_MAP_ID))),
      title,
    },
  };
}

afterEach(() => {
  chroniclesClearRuntimeMapDefinitions();
  vi.useRealTimers();
});

describe('Chronicles bounded Game Director bootstrap', () => {
  it('installs a validated remote map only before the run mounts', async () => {
    const resolveArea = vi.fn().mockResolvedValue(remoteEnvelope());

    const resolved = await chroniclesBootstrapTacticsWorld({ resolveArea, budgetMs: 250 });

    expect(resolved.source).toBe('remote');
    expect(chroniclesMapById(DEFAULT_CHRONICLES_MAP_ID).title).toBe('Cripta remota');
    expect(resolveArea).toHaveBeenCalledTimes(1);
  });

  it('keeps the bundled map when the Game Director fails open', async () => {
    const local = chroniclesMapById(DEFAULT_CHRONICLES_MAP_ID);
    const resolveArea = vi.fn().mockResolvedValue({
      source: 'local',
      map: local,
      seed: 0,
      fallbackReason: 'network-down',
    });

    const resolved = await chroniclesBootstrapTacticsWorld({ resolveArea, budgetMs: 250 });

    expect(resolved.source).toBe('local');
    expect(resolved.fallbackReason).toBe('network-down');
    expect(chroniclesMapById(DEFAULT_CHRONICLES_MAP_ID)).toBe(local);
  });

  it('does not let a late remote response change a run after the deadline', async () => {
    vi.useFakeTimers();
    const local = chroniclesMapById(DEFAULT_CHRONICLES_MAP_ID);
    let release;
    const resolveArea = vi.fn(() => new Promise((resolve) => {
      release = resolve;
    }));

    const bootstrap = chroniclesBootstrapTacticsWorld({ resolveArea, budgetMs: 50 });
    await vi.advanceTimersByTimeAsync(50);
    const resolved = await bootstrap;

    expect(resolved.source).toBe('local');
    expect(resolved.fallbackReason).toBe('bootstrap-deadline');
    expect(chroniclesMapById(DEFAULT_CHRONICLES_MAP_ID)).toBe(local);

    release(remoteEnvelope('Demasiado tarde'));
    await Promise.resolve();
    expect(chroniclesMapById(DEFAULT_CHRONICLES_MAP_ID)).toBe(local);
  });

  it('clears a previous remote override before a new bootstrap attempt', async () => {
    await chroniclesBootstrapTacticsWorld({
      resolveArea: vi.fn().mockResolvedValue(remoteEnvelope('Primera remota')),
    });
    expect(chroniclesMapById(DEFAULT_CHRONICLES_MAP_ID).title).toBe('Primera remota');

    const resolved = await chroniclesBootstrapTacticsWorld({
      resolveArea: vi.fn().mockResolvedValue({ source: 'local', fallbackReason: 'offline' }),
    });

    expect(resolved.source).toBe('local');
    expect(chroniclesMapById(DEFAULT_CHRONICLES_MAP_ID).title).toBe('Cripta de las Ocho Casillas');
  });
});

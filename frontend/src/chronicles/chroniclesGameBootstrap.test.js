import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_CHRONICLES_MAP_ID,
  chroniclesClearRuntimeMapDefinitions,
  chroniclesMapById,
  chroniclesMapIds,
} from './chroniclesMapCatalog.js';
import { CHRONICLES_DIRECTOR_SCHEMA_VERSION } from './chroniclesGameDirector.js';
import { chroniclesBootstrapTacticsWorld } from './chroniclesGameBootstrap.js';

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function remoteArea(mapId, seed, title = null) {
  const base = clone(chroniclesMapById(mapId));
  const manifest = {
    ...base,
    title: title || `Remota · ${base.title}`,
  };
  const revision = 'b'.repeat(64);
  return {
    schemaVersion: CHRONICLES_DIRECTOR_SCHEMA_VERSION,
    mapId,
    contentVersion: manifest.version,
    seed,
    instanceId: 'a'.repeat(24),
    manifestRevision: revision,
    manifest,
  };
}

function remoteRun(title = 'Cripta remota', seed = 417) {
  const areas = chroniclesMapIds().map((mapId) => (
    remoteArea(mapId, seed, mapId === DEFAULT_CHRONICLES_MAP_ID ? title : null)
  ));
  const area = areas.find((entry) => entry.mapId === DEFAULT_CHRONICLES_MAP_ID);
  return {
    runId: '11111111-2222-4333-8444-555555555555',
    seed,
    currentMapId: DEFAULT_CHRONICLES_MAP_ID,
    contentVersion: area.contentVersion,
    manifestRevision: area.manifestRevision,
    status: 'active',
    worldVersion: 0,
    consumedContentIds: [],
    claimedRewards: [],
    area,
    areas,
  };
}

afterEach(() => {
  chroniclesClearRuntimeMapDefinitions();
  vi.useRealTimers();
});

describe('Chronicles bounded authoritative-run bootstrap', () => {
  it('installs the backend-bound map and preserves run identity before gameplay mounts', async () => {
    const createRun = vi.fn().mockResolvedValue(remoteRun());

    const resolved = await chroniclesBootstrapTacticsWorld({ createRun, budgetMs: 250 });

    expect(resolved.source).toBe('remote');
    expect(resolved.runId).toBe('11111111-2222-4333-8444-555555555555');
    expect(resolved.seed).toBe(417);
    expect(resolved.worldVersion).toBe(0);
    expect(chroniclesMapById(DEFAULT_CHRONICLES_MAP_ID).title).toBe('Cripta remota');
    expect(chroniclesMapById('gallery-of-forks').title).toMatch(/^Remota · /);
    expect(chroniclesMapById('hollow-bell-tower').title).toMatch(/^Remota · /);
    expect(chroniclesMapById('echo-cistern').title).toMatch(/^Remota · /);
    expect(resolved.areas).toHaveLength(chroniclesMapIds().length);
    expect(createRun).toHaveBeenCalledWith(DEFAULT_CHRONICLES_MAP_ID, {
      operationId: null,
      signal: expect.any(AbortSignal),
    });
  });

  it('keeps the bundled map when run creation fails open', async () => {
    const local = chroniclesMapById(DEFAULT_CHRONICLES_MAP_ID);
    const createRun = vi.fn().mockRejectedValue(new Error('network-down'));

    const resolved = await chroniclesBootstrapTacticsWorld({ createRun, budgetMs: 250 });

    expect(resolved.source).toBe('local');
    expect(resolved.runId).toBeNull();
    expect(resolved.fallbackReason).toBe('network-down');
    expect(chroniclesMapById(DEFAULT_CHRONICLES_MAP_ID)).toBe(local);
  });

  it('does not let a late run response change gameplay after the deadline', async () => {
    vi.useFakeTimers();
    const local = chroniclesMapById(DEFAULT_CHRONICLES_MAP_ID);
    let release;
    const createRun = vi.fn(() => new Promise((resolve) => {
      release = resolve;
    }));

    const bootstrap = chroniclesBootstrapTacticsWorld({ createRun, budgetMs: 50 });
    await vi.advanceTimersByTimeAsync(50);
    const resolved = await bootstrap;

    expect(resolved.source).toBe('local');
    expect(resolved.fallbackReason).toBe('bootstrap-deadline');
    expect(chroniclesMapById(DEFAULT_CHRONICLES_MAP_ID)).toBe(local);

    release(remoteRun('Demasiado tarde'));
    await Promise.resolve();
    expect(chroniclesMapById(DEFAULT_CHRONICLES_MAP_ID)).toBe(local);
  });

  it('rejects an incomplete area bundle without partially installing remote maps', async () => {
    const localCryptTitle = chroniclesMapById(DEFAULT_CHRONICLES_MAP_ID).title;
    const localGalleryTitle = chroniclesMapById('gallery-of-forks').title;
    const payload = remoteRun();
    payload.areas = payload.areas.slice(0, -1);

    const resolved = await chroniclesBootstrapTacticsWorld({
      createRun: vi.fn().mockResolvedValue(payload),
    });

    expect(resolved.source).toBe('local');
    expect(resolved.fallbackReason).toBe('incomplete-area-bundle');
    expect(chroniclesMapById(DEFAULT_CHRONICLES_MAP_ID).title).toBe(localCryptTitle);
    expect(chroniclesMapById('gallery-of-forks').title).toBe(localGalleryTitle);
  });

  it('rejects a run whose authoritative metadata disagrees with its area envelope', async () => {
    const payload = remoteRun();
    payload.manifestRevision = 'c'.repeat(64);

    const resolved = await chroniclesBootstrapTacticsWorld({
      createRun: vi.fn().mockResolvedValue(payload),
    });

    expect(resolved.source).toBe('local');
    expect(resolved.fallbackReason).toBe('run-revision-mismatch');
    expect(chroniclesMapById(DEFAULT_CHRONICLES_MAP_ID).title).toBe('Cripta de las Ocho Casillas');
  });

  it('clears a previous remote override before a new bootstrap attempt', async () => {
    await chroniclesBootstrapTacticsWorld({
      createRun: vi.fn().mockResolvedValue(remoteRun('Primera remota')),
    });
    expect(chroniclesMapById(DEFAULT_CHRONICLES_MAP_ID).title).toBe('Primera remota');

    const resolved = await chroniclesBootstrapTacticsWorld({
      createRun: vi.fn().mockRejectedValue(new Error('offline')),
    });

    expect(resolved.source).toBe('local');
    expect(chroniclesMapById(DEFAULT_CHRONICLES_MAP_ID).title).toBe('Cripta de las Ocho Casillas');
  });
});

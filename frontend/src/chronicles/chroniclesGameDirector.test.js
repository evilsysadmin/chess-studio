import { describe, expect, it, vi } from 'vitest';
import { chroniclesMapById } from './chroniclesMapCatalog.js';
import {
  CHRONICLES_DIRECTOR_SCHEMA_VERSION,
  chroniclesResolveAreaManifest,
} from './chroniclesGameDirector.js';

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function remoteEnvelope(mapId, seed, mutate = (map) => map) {
  const manifest = mutate(clone(chroniclesMapById(mapId)));
  return {
    schemaVersion: CHRONICLES_DIRECTOR_SCHEMA_VERSION,
    mapId,
    contentVersion: manifest.version,
    seed,
    instanceId: 'a'.repeat(24),
    manifestRevision: 'b'.repeat(64),
    manifest,
  };
}

describe('Chronicles Game Director frontend resolver', () => {
  it('accepts a validated remote manifest without coupling gameplay to transport', async () => {
    const fetchManifest = vi.fn().mockResolvedValue(remoteEnvelope('crypt-eight-squares', 417, (manifest) => ({
      ...manifest,
      title: 'Cripta remota validada',
    })));

    const resolved = await chroniclesResolveAreaManifest('crypt-eight-squares', { seed: 417, fetchManifest });

    expect(fetchManifest).toHaveBeenCalledWith('crypt-eight-squares', 417, { signal: undefined });
    expect(resolved.source).toBe('remote');
    expect(resolved.map.title).toBe('Cripta remota validada');
    expect(Object.isFrozen(resolved.map)).toBe(true);
    expect(resolved.instanceId).toHaveLength(24);
    expect(resolved.manifestRevision).toHaveLength(64);
  });

  it('accepts seeded remote geometry that differs from the bundled fallback', async () => {
    const authored = chroniclesMapById('crypt-eight-squares');
    const fetchManifest = vi.fn().mockResolvedValue(remoteEnvelope('crypt-eight-squares', 418, (manifest) => {
      const grid = [...manifest.grid];
      grid[2] = '#..##.#';
      return {
        ...manifest,
        grid,
        generation: {
          kind: 'seeded-layout',
          mapCode: 'CM1|theme=crypt|size=7x7|verbs=guardian|enemies=2|treasures=1|secrets=0|difficulty=2|seed=418',
          generatorVersion: 1,
          layoutRevision: 'c'.repeat(64),
        },
      };
    }));

    const resolved = await chroniclesResolveAreaManifest('crypt-eight-squares', { seed: 418, fetchManifest });

    expect(resolved.source).toBe('remote');
    expect(resolved.map.grid).not.toEqual(authored.grid);
    expect(resolved.map.grid[2]).toBe('#..##.#');
    expect(resolved.map.generation).toMatchObject({
      kind: 'seeded-layout',
      generatorVersion: 1,
    });
  });

  it('fails open to the bundled map when transport is unavailable', async () => {
    const fetchManifest = vi.fn().mockRejectedValue(new Error('network-down'));

    const resolved = await chroniclesResolveAreaManifest('gallery-of-forks', { seed: 9, fetchManifest });

    expect(resolved.source).toBe('local');
    expect(resolved.map).toBe(chroniclesMapById('gallery-of-forks'));
    expect(resolved.fallbackReason).toBe('network-down');
  });

  it('rejects an incompatible or inconsistent remote envelope and keeps the local fallback', async () => {
    const wrongSchema = remoteEnvelope('menagerie-of-ash', 12);
    wrongSchema.schemaVersion = 99;
    const wrongSeed = remoteEnvelope('menagerie-of-ash', 13);

    const schemaResult = await chroniclesResolveAreaManifest('menagerie-of-ash', {
      seed: 12,
      fetchManifest: vi.fn().mockResolvedValue(wrongSchema),
    });
    const seedResult = await chroniclesResolveAreaManifest('menagerie-of-ash', {
      seed: 12,
      fetchManifest: vi.fn().mockResolvedValue(wrongSeed),
    });

    expect(schemaResult.source).toBe('local');
    expect(schemaResult.fallbackReason).toBe('unsupported-schema');
    expect(seedResult.source).toBe('local');
    expect(seedResult.fallbackReason).toBe('seed-mismatch');
  });

  it('does not ask the backend for an unknown internal map id', async () => {
    const fetchManifest = vi.fn();

    const resolved = await chroniclesResolveAreaManifest('missing-room', { fetchManifest });

    expect(fetchManifest).not.toHaveBeenCalled();
    expect(resolved.source).toBe('local');
    expect(resolved.fallbackReason).toBe('unknown-map');
    expect(resolved.map.id).toBe('crypt-eight-squares');
  });
});

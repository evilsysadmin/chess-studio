import { describe, expect, it, vi } from 'vitest';
import {
  PAWN_SLUG_DEFAULT_STAGE_ID,
  PAWN_SLUG_DIRECTOR_SCHEMA_VERSION,
  PAWN_SLUG_STAGE_CONTENT_VERSION,
  pawnSlugLocalStageManifest,
  pawnSlugResolveStageManifest,
  pawnSlugValidateStageEnvelope,
  pawnSlugValidateStageManifest,
} from './pawnSlugGameDirector.js';

function remoteEnvelope(manifest = pawnSlugLocalStageManifest(), seed = 417) {
  return {
    schemaVersion: PAWN_SLUG_DIRECTOR_SCHEMA_VERSION,
    stageId: PAWN_SLUG_DEFAULT_STAGE_ID,
    seed,
    contentVersion: manifest.version,
    instanceId: 'b'.repeat(24),
    manifestRevision: 'a'.repeat(64),
    manifest: JSON.parse(JSON.stringify(manifest)),
  };
}

describe('Pawn Slug Game Director contract', () => {
  it('exposes the current vertical slice as a frozen local stage manifest', () => {
    const stage = pawnSlugLocalStageManifest();

    expect(stage.id).toBe(PAWN_SLUG_DEFAULT_STAGE_ID);
    expect(stage.version).toBe(PAWN_SLUG_STAGE_CONTENT_VERSION);
    expect(stage.world.width).toBeGreaterThan(stage.world.extractionX);
    expect(stage.spawns.length).toBeGreaterThan(20);
    expect(stage.spawns.every((spawn) => stage.enemyProfiles[spawn.type])).toBe(true);
    expect(Object.isFrozen(stage)).toBe(true);
    expect(Object.isFrozen(stage.spawns)).toBe(true);
  });

  it('accepts a versioned deterministic remote envelope without changing frame-critical ownership', async () => {
    const seed = 417;
    const payload = remoteEnvelope(pawnSlugLocalStageManifest(), seed);
    const fetchManifest = vi.fn(async () => payload);

    const resolved = await pawnSlugResolveStageManifest(PAWN_SLUG_DEFAULT_STAGE_ID, {
      seed,
      fetchManifest,
    });

    expect(fetchManifest).toHaveBeenCalledWith(PAWN_SLUG_DEFAULT_STAGE_ID, seed, { signal: undefined });
    expect(resolved.source).toBe('remote');
    expect(resolved.stage.id).toBe(PAWN_SLUG_DEFAULT_STAGE_ID);
    expect(resolved.stage.spawns).toHaveLength(pawnSlugLocalStageManifest().spawns.length);
    expect(resolved.instanceId).toBe(payload.instanceId);
  });

  it('falls back locally when transport is unavailable or remote content is invalid', async () => {
    const withoutTransport = await pawnSlugResolveStageManifest();
    expect(withoutTransport.source).toBe('local');
    expect(withoutTransport.fallbackReason).toBe('transport-unavailable');

    const broken = remoteEnvelope();
    broken.manifest.spawns[1].id = broken.manifest.spawns[0].id;
    const invalidRemote = await pawnSlugResolveStageManifest(PAWN_SLUG_DEFAULT_STAGE_ID, {
      seed: broken.seed,
      fetchManifest: async () => broken,
    });
    expect(invalidRemote.source).toBe('local');
    expect(invalidRemote.fallbackReason).toBe('duplicate-spawn-id');
  });

  it('rejects mismatched envelopes and malformed stage definitions explicitly', () => {
    const payload = remoteEnvelope();
    expect(() => pawnSlugValidateStageEnvelope({ ...payload, seed: payload.seed + 1 }, payload.stageId, payload.seed))
      .toThrow('seed-mismatch');

    const stage = JSON.parse(JSON.stringify(payload.manifest));
    stage.world.extractionX = stage.world.width + 1;
    expect(() => pawnSlugValidateStageManifest(stage)).toThrow('invalid-extraction-position');
  });
});

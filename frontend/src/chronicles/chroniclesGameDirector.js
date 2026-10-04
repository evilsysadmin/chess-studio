import {
  chroniclesMapById,
  chroniclesMapIds,
  chroniclesValidateMapDefinition,
} from './chroniclesMapCatalog.js';

export const CHRONICLES_DIRECTOR_SCHEMA_VERSION = 1;
const REVISION_RE = /^[a-f0-9]{64}$/;
const INSTANCE_RE = /^[a-f0-9]{24}$/;

function normalizeDifficulty(payload) {
  if (payload === undefined) return null;
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) throw new Error('invalid-difficulty');
  const keys = [
    'version',
    'partyLevel',
    'depth',
    'targetLevel',
    'minLevel',
    'maxLevel',
    'depthPressure',
    'progressionPressure',
    'authoredLevel',
    'requestedDelta',
    'appliedDelta',
  ];
  if (keys.some((key) => !Number.isInteger(payload[key]))) throw new Error('invalid-difficulty');
  if (payload.version !== 1 || payload.partyLevel < 1 || payload.targetLevel < 1) {
    throw new Error('invalid-difficulty');
  }
  return Object.freeze(Object.fromEntries(keys.map((key) => [key, payload[key]])));
}

export function chroniclesValidateAreaEnvelope(payload, mapId, seed) {
  if (!payload || typeof payload !== 'object') throw new Error('missing-envelope');
  if (payload.schemaVersion !== CHRONICLES_DIRECTOR_SCHEMA_VERSION) throw new Error('unsupported-schema');
  if (payload.mapId !== mapId) throw new Error('map-mismatch');
  if (payload.seed !== seed) throw new Error('seed-mismatch');
  if (!REVISION_RE.test(String(payload.manifestRevision || ''))) throw new Error('invalid-revision');
  if (!INSTANCE_RE.test(String(payload.instanceId || ''))) throw new Error('invalid-instance');
  if (!payload.manifest || payload.contentVersion !== payload.manifest.version) throw new Error('version-mismatch');

  const map = chroniclesValidateMapDefinition(payload.manifest, chroniclesMapIds());
  if (map.id !== mapId) throw new Error('manifest-map-mismatch');
  const difficulty = normalizeDifficulty(payload.difficulty);
  return Object.freeze({
    source: 'remote',
    mapId,
    map,
    difficulty,
    schemaVersion: payload.schemaVersion,
    contentVersion: payload.contentVersion,
    seed,
    instanceId: payload.instanceId,
    manifestRevision: payload.manifestRevision,
  });
}

function localFallback(mapId, seed, reason = 'remote-unavailable') {
  return Object.freeze({
    source: 'local',
    mapId,
    map: chroniclesMapById(mapId),
    difficulty: null,
    schemaVersion: null,
    contentVersion: null,
    seed,
    instanceId: null,
    manifestRevision: null,
    fallbackReason: reason,
  });
}

export async function chroniclesResolveAreaManifest(
  mapId,
  {
    seed = 0,
    signal,
    fetchManifest,
    allowBundledFallback = false,
  } = {},
) {
  const fail = (reason, error = null) => {
    if (allowBundledFallback) return localFallback(mapId, seed, reason);
    const failure = error instanceof Error ? error : new Error(reason);
    failure.reason = reason;
    throw failure;
  };

  if (!chroniclesMapIds().includes(mapId)) return fail('unknown-map');
  if (typeof fetchManifest !== 'function') return fail('transport-unavailable');

  try {
    const payload = await fetchManifest(mapId, seed, { signal });
    return chroniclesValidateAreaEnvelope(payload, mapId, seed);
  } catch (error) {
    if (signal?.aborted) return fail('aborted', error);
    return fail(error instanceof Error ? error.message : 'remote-unavailable', error);
  }
}

import {
  PAWN_SLUG_ENEMIES,
  PAWN_SLUG_SPAWNS,
  PAWN_SLUG_WORLD,
} from './pawnSlug.js';

export const PAWN_SLUG_DIRECTOR_SCHEMA_VERSION = 1;
export const PAWN_SLUG_DEFAULT_STAGE_ID = 'pawn-slug-v1';
export const PAWN_SLUG_STAGE_CONTENT_VERSION = 1;

const REVISION_RE = /^[a-f0-9]{64}$/;
const INSTANCE_RE = /^[a-f0-9]{24}$/;

function finiteNumber(value, name) {
  const number = Number(value);
  if (!Number.isFinite(number)) throw new Error(`invalid-${name}`);
  return number;
}

function positiveNumber(value, name) {
  const number = finiteNumber(value, name);
  if (number <= 0) throw new Error(`invalid-${name}`);
  return number;
}

function normalizeWorld(world) {
  if (!world || typeof world !== 'object') throw new Error('invalid-world');
  const normalized = Object.freeze({
    width: positiveNumber(world.width, 'world-width'),
    groundY: finiteNumber(world.groundY, 'world-ground-y'),
    bossX: finiteNumber(world.bossX, 'world-boss-x'),
    extractionX: finiteNumber(world.extractionX, 'world-extraction-x'),
  });
  if (normalized.bossX <= 0 || normalized.bossX >= normalized.extractionX) throw new Error('invalid-boss-position');
  if (normalized.extractionX > normalized.width) throw new Error('invalid-extraction-position');
  return normalized;
}

function normalizeEnemyProfiles(enemyProfiles) {
  if (!enemyProfiles || typeof enemyProfiles !== 'object' || Array.isArray(enemyProfiles)) {
    throw new Error('invalid-enemy-profiles');
  }
  const entries = Object.entries(enemyProfiles);
  if (!entries.length) throw new Error('missing-enemy-profiles');
  return Object.freeze(Object.fromEntries(entries.map(([type, profile]) => {
    if (!type || !profile || typeof profile !== 'object') throw new Error('invalid-enemy-profile');
    return [type, Object.freeze({
      hp: positiveNumber(profile.hp, `${type}-hp`),
      speed: finiteNumber(profile.speed, `${type}-speed`),
      score: finiteNumber(profile.score, `${type}-score`),
      xp: finiteNumber(profile.xp, `${type}-xp`),
      width: positiveNumber(profile.width, `${type}-width`),
      height: positiveNumber(profile.height, `${type}-height`),
      ...(profile.midBoss ? { midBoss: true } : {}),
    })];
  })));
}

function normalizeSpawns(spawns, enemyProfiles) {
  if (!Array.isArray(spawns)) throw new Error('invalid-spawns');
  const ids = new Set();
  return Object.freeze(spawns.map((spawn) => {
    if (!spawn || typeof spawn !== 'object') throw new Error('invalid-spawn');
    const id = String(spawn.id || '');
    const type = String(spawn.type || '');
    if (!id) throw new Error('missing-spawn-id');
    if (ids.has(id)) throw new Error('duplicate-spawn-id');
    if (!enemyProfiles[type]) throw new Error('unknown-spawn-type');
    ids.add(id);
    return Object.freeze({
      id,
      type,
      x: finiteNumber(spawn.x, `${id}-x`),
      ...(Number.isFinite(Number(spawn.y)) ? { y: Number(spawn.y) } : {}),
    });
  }));
}

export function pawnSlugValidateStageManifest(manifest, expectedStageId = PAWN_SLUG_DEFAULT_STAGE_ID) {
  if (!manifest || typeof manifest !== 'object') throw new Error('missing-manifest');
  if (manifest.id !== expectedStageId) throw new Error('stage-mismatch');
  if (manifest.version !== PAWN_SLUG_STAGE_CONTENT_VERSION) throw new Error('unsupported-content-version');
  const enemyProfiles = normalizeEnemyProfiles(manifest.enemyProfiles);
  return Object.freeze({
    id: manifest.id,
    version: manifest.version,
    world: normalizeWorld(manifest.world),
    enemyProfiles,
    spawns: normalizeSpawns(manifest.spawns, enemyProfiles),
  });
}

export function pawnSlugLocalStageManifest() {
  return pawnSlugValidateStageManifest({
    id: PAWN_SLUG_DEFAULT_STAGE_ID,
    version: PAWN_SLUG_STAGE_CONTENT_VERSION,
    world: PAWN_SLUG_WORLD,
    enemyProfiles: PAWN_SLUG_ENEMIES,
    spawns: PAWN_SLUG_SPAWNS,
  });
}

export function pawnSlugValidateStageEnvelope(payload, stageId, seed) {
  if (!payload || typeof payload !== 'object') throw new Error('missing-envelope');
  if (payload.schemaVersion !== PAWN_SLUG_DIRECTOR_SCHEMA_VERSION) throw new Error('unsupported-schema');
  if (payload.stageId !== stageId) throw new Error('stage-mismatch');
  if (payload.seed !== seed) throw new Error('seed-mismatch');
  if (!REVISION_RE.test(String(payload.manifestRevision || ''))) throw new Error('invalid-revision');
  if (!INSTANCE_RE.test(String(payload.instanceId || ''))) throw new Error('invalid-instance');
  if (!payload.manifest || payload.contentVersion !== payload.manifest.version) throw new Error('version-mismatch');

  return Object.freeze({
    source: 'remote',
    stage: pawnSlugValidateStageManifest(payload.manifest, stageId),
    schemaVersion: payload.schemaVersion,
    contentVersion: payload.contentVersion,
    seed,
    instanceId: payload.instanceId,
    manifestRevision: payload.manifestRevision,
  });
}

function localFallback(stageId, seed, reason = 'remote-unavailable') {
  return Object.freeze({
    source: 'local',
    stage: pawnSlugLocalStageManifest(),
    schemaVersion: null,
    contentVersion: PAWN_SLUG_STAGE_CONTENT_VERSION,
    seed,
    instanceId: null,
    manifestRevision: null,
    fallbackReason: stageId === PAWN_SLUG_DEFAULT_STAGE_ID ? reason : 'unknown-stage',
  });
}

export async function pawnSlugResolveStageManifest(
  stageId = PAWN_SLUG_DEFAULT_STAGE_ID,
  { seed = 0, signal, fetchManifest } = {},
) {
  if (stageId !== PAWN_SLUG_DEFAULT_STAGE_ID) return localFallback(stageId, seed, 'unknown-stage');
  if (typeof fetchManifest !== 'function') return localFallback(stageId, seed, 'transport-unavailable');

  try {
    const payload = await fetchManifest(stageId, seed, { signal });
    return pawnSlugValidateStageEnvelope(payload, stageId, seed);
  } catch (error) {
    if (signal?.aborted) return localFallback(stageId, seed, 'aborted');
    return localFallback(stageId, seed, error instanceof Error ? error.message : 'remote-unavailable');
  }
}

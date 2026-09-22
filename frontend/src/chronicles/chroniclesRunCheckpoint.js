import {
  chroniclesMapById,
  chroniclesMapIds,
} from './chroniclesMapCatalog.js';

const CONTENT_GROUPS = Object.freeze(['triggers', 'interactables', 'treasures', 'traps', 'exits']);

function authoredSetKeys(map) {
  const contentEffects = CONTENT_GROUPS.flatMap((group) => (
    (map?.[group] || []).flatMap((entry) => entry?.action?.effects || [])
  ));
  const defeatEffects = (map?.enemies || []).flatMap((enemy) => enemy?.onDefeat?.effects || []);
  return [...contentEffects, ...defeatEffects]
    .filter((effect) => effect?.type === 'set' && typeof effect.key === 'string' && effect.key)
    .map((effect) => effect.key);
}

function checkpointFlagKeys() {
  return chroniclesMapIds().flatMap((mapId) => {
    const map = chroniclesMapById(mapId);
    return [
      ...Object.keys(map.initialFlags || {}),
      ...authoredSetKeys(map),
    ];
  });
}

function durableFlagValue(value) {
  return value === null || ['boolean', 'number', 'string'].includes(typeof value);
}

function normalizedLedger(values) {
  if (!Array.isArray(values)) return [];
  return [...new Set(values.filter((value) => typeof value === 'string' && value.trim()).map((value) => value.trim()))];
}

export function chroniclesWorldFlagsForCheckpoint(state) {
  const source = state && typeof state === 'object' ? state : {};
  return Object.fromEntries(
    checkpointFlagKeys()
      .filter((key, index, keys) => keys.indexOf(key) === index)
      .filter((key) => Object.prototype.hasOwnProperty.call(source, key))
      .filter((key) => durableFlagValue(source[key]))
      .map((key) => [key, source[key]]),
  );
}

export function chroniclesRunCheckpointPayload(state, worldVersion) {
  if (!state?.mapId) throw new Error('Chronicles checkpoint requires a current map');
  if (!Number.isInteger(worldVersion) || worldVersion < 0) {
    throw new Error('Chronicles checkpoint requires a non-negative worldVersion');
  }
  return Object.freeze({
    expectedWorldVersion: worldVersion,
    currentMapId: state.mapId,
    worldFlags: chroniclesWorldFlagsForCheckpoint(state),
    consumedContentIds: normalizedLedger(state.consumedContentIds),
    claimedRewards: normalizedLedger(state.claimedRewards),
  });
}


export function chroniclesApplyRunCheckpoint(state, run) {
  if (!state || !run) return state;
  return {
    ...state,
    ...(run.worldFlags || {}),
    consumedContentIds: normalizedLedger(run.consumedContentIds),
    claimedRewards: normalizedLedger(run.claimedRewards),
  };
}

export function chroniclesRunCheckpointFingerprint(state) {
  if (!state?.mapId) return '';
  const payload = chroniclesRunCheckpointPayload(state, 0);
  return JSON.stringify({
    currentMapId: payload.currentMapId,
    worldFlags: payload.worldFlags,
    consumedContentIds: payload.consumedContentIds,
    claimedRewards: payload.claimedRewards,
  });
}

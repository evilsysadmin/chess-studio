import {
  chroniclesMapById,
  chroniclesMapIds,
} from './chroniclesMapCatalog.js';

function checkpointFlagKeys() {
  return chroniclesMapIds().flatMap((mapId) => Object.keys(chroniclesMapById(mapId).initialFlags || {}));
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

import { abortableDelay } from '../asyncControl.js';
import { chroniclesValidateAreaEnvelope } from './chroniclesGameDirector.js';
import {
  DEFAULT_CHRONICLES_MAP_ID,
  chroniclesClearRuntimeMapDefinitions,
  chroniclesInstallRuntimeMapDefinition,
  chroniclesMapById,
  chroniclesMapIds,
} from './chroniclesMapCatalog.js';
import { chroniclesCreateRun } from './chroniclesRunClient.js';

export const CHRONICLES_BOOTSTRAP_BUDGET_MS = 5000;

function localBootstrap(mapId, seed, fallbackReason) {
  return Object.freeze({
    source: 'local',
    map: chroniclesMapById(mapId),
    seed,
    runId: null,
    worldVersion: null,
    fallbackReason,
  });
}

function validateRunBootstrap(payload, requestedMapId) {
  if (!payload || typeof payload !== 'object') throw new Error('missing-run');
  if (typeof payload.runId !== 'string' || !payload.runId) throw new Error('invalid-run-id');
  const currentMapId = payload.currentMapId;
  if (!chroniclesMapIds().includes(currentMapId)) throw new Error('unknown-run-map');
  if (requestedMapId && currentMapId !== requestedMapId) throw new Error('run-map-mismatch');
  if (!Number.isInteger(payload.seed) || payload.seed < 0) throw new Error('invalid-run-seed');
  if (!Number.isInteger(payload.worldVersion) || payload.worldVersion < 0) throw new Error('invalid-world-version');
  if (payload.status !== 'active') throw new Error('inactive-run');

  const area = chroniclesValidateAreaEnvelope(payload.area, currentMapId, payload.seed);
  if (payload.contentVersion !== area.contentVersion) throw new Error('run-version-mismatch');
  if (payload.manifestRevision !== area.manifestRevision) throw new Error('run-revision-mismatch');

  if (!Array.isArray(payload.areas)) throw new Error('missing-area-bundle');
  const expectedMapIds = chroniclesMapIds();
  const expected = new Set(expectedMapIds);
  const seen = new Set();
  const areas = payload.areas.map((entry) => {
    if (!entry || typeof entry.mapId !== 'string' || !expected.has(entry.mapId)) {
      throw new Error('unknown-bundled-map');
    }
    if (seen.has(entry.mapId)) throw new Error('duplicate-bundled-map');
    seen.add(entry.mapId);
    return chroniclesValidateAreaEnvelope(entry, entry.mapId, payload.seed);
  });
  if (seen.size !== expected.size || expectedMapIds.some((id) => !seen.has(id))) {
    throw new Error('incomplete-area-bundle');
  }

  const bundledCurrent = areas.find((entry) => entry.map.id === currentMapId);
  if (!bundledCurrent || bundledCurrent.manifestRevision !== area.manifestRevision) {
    throw new Error('current-area-bundle-mismatch');
  }

  return Object.freeze({
    ...area,
    areas: Object.freeze(areas),
    runId: payload.runId,
    currentMapId,
    worldVersion: payload.worldVersion,
    runStatus: payload.status,
  });
}

export async function chroniclesBootstrapTacticsWorld({
  mapId = null,
  seed = 0,
  budgetMs = CHRONICLES_BOOTSTRAP_BUDGET_MS,
  signal,
  operationId = null,
  createRun = chroniclesCreateRun,
} = {}) {
  // Chronicles generation happens before gameplay mounts, so this bootstrap is
  // allowed a realistic WAN budget. The authored bundle remains a safety net for
  // genuine backend/network failure; frame-critical gameplay never waits on it.
  chroniclesClearRuntimeMapDefinitions();
  const fallbackMapId = mapId || DEFAULT_CHRONICLES_MAP_ID;
  if (signal?.aborted) return localBootstrap(fallbackMapId, seed, 'aborted');

  const requestController = new AbortController();
  const deadlineController = new AbortController();
  const abortPending = () => {
    requestController.abort();
    deadlineController.abort();
  };
  signal?.addEventListener('abort', abortPending, { once: true });

  const deadline = abortableDelay(Math.max(0, Number(budgetMs) || 0), deadlineController.signal)
    .then(() => {
      requestController.abort();
      return localBootstrap(fallbackMapId, seed, 'bootstrap-deadline');
    })
    .catch(() => localBootstrap(mapId, seed, signal?.aborted ? 'aborted' : 'bootstrap-cancelled'));

  const request = Promise.resolve()
    .then(() => createRun(mapId, { operationId, signal: requestController.signal }))
    .then((payload) => validateRunBootstrap(payload, mapId))
    .catch((error) => localBootstrap(
      fallbackMapId,
      seed,
      error instanceof Error ? error.message : 'remote-unavailable',
    ));

  let resolved;
  try {
    resolved = await Promise.race([request, deadline]);
  } finally {
    deadlineController.abort();
    signal?.removeEventListener('abort', abortPending);
  }

  if (signal?.aborted) return localBootstrap(fallbackMapId, seed, 'aborted');
  if (resolved?.source !== 'remote') {
    return localBootstrap(fallbackMapId, seed, resolved?.fallbackReason || 'remote-unavailable');
  }

  resolved.areas.forEach((entry) => {
    chroniclesInstallRuntimeMapDefinition(entry.map);
  });
  const map = chroniclesMapById(resolved.currentMapId);
  return Object.freeze({ ...resolved, map });
}

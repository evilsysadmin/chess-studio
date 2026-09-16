import { abortableDelay } from '../asyncControl.js';
import { chroniclesValidateAreaEnvelope } from './chroniclesGameDirector.js';
import {
  DEFAULT_CHRONICLES_MAP_ID,
  chroniclesClearRuntimeMapDefinitions,
  chroniclesInstallRuntimeMapDefinition,
  chroniclesMapById,
} from './chroniclesMapCatalog.js';
import { chroniclesCreateRun } from './chroniclesRunClient.js';

export const CHRONICLES_BOOTSTRAP_BUDGET_MS = 250;

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

function validateRunBootstrap(payload, mapId) {
  if (!payload || typeof payload !== 'object') throw new Error('missing-run');
  if (typeof payload.runId !== 'string' || !payload.runId) throw new Error('invalid-run-id');
  if (payload.currentMapId !== mapId) throw new Error('run-map-mismatch');
  if (!Number.isInteger(payload.seed) || payload.seed < 0) throw new Error('invalid-run-seed');
  if (!Number.isInteger(payload.worldVersion) || payload.worldVersion < 0) throw new Error('invalid-world-version');
  if (payload.status !== 'active') throw new Error('inactive-run');

  const area = chroniclesValidateAreaEnvelope(payload.area, mapId, payload.seed);
  if (payload.contentVersion !== area.contentVersion) throw new Error('run-version-mismatch');
  if (payload.manifestRevision !== area.manifestRevision) throw new Error('run-revision-mismatch');

  return Object.freeze({
    ...area,
    runId: payload.runId,
    worldVersion: payload.worldVersion,
    runStatus: payload.status,
  });
}

export async function chroniclesBootstrapTacticsWorld({
  mapId = DEFAULT_CHRONICLES_MAP_ID,
  seed = 0,
  budgetMs = CHRONICLES_BOOTSTRAP_BUDGET_MS,
  signal,
  operationId = null,
  createRun = chroniclesCreateRun,
} = {}) {
  // Every entry starts from the bundled fallback. A remote run + area is only
  // installed if the single bootstrap request wins the bounded race before
  // gameplay mounts. The frame-critical runtime never waits on the network.
  chroniclesClearRuntimeMapDefinitions();
  if (signal?.aborted) return localBootstrap(mapId, seed, 'aborted');

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
      return localBootstrap(mapId, seed, 'bootstrap-deadline');
    })
    .catch(() => localBootstrap(mapId, seed, signal?.aborted ? 'aborted' : 'bootstrap-cancelled'));

  const request = Promise.resolve()
    .then(() => createRun(mapId, { operationId, signal: requestController.signal }))
    .then((payload) => validateRunBootstrap(payload, mapId))
    .catch((error) => localBootstrap(
      mapId,
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

  if (signal?.aborted) return localBootstrap(mapId, seed, 'aborted');
  if (resolved?.source !== 'remote') {
    return localBootstrap(mapId, seed, resolved?.fallbackReason || 'remote-unavailable');
  }

  const map = chroniclesInstallRuntimeMapDefinition(resolved.map);
  return Object.freeze({ ...resolved, map });
}

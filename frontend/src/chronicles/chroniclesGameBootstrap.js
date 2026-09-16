import { api } from '../api.js';
import {
  DEFAULT_CHRONICLES_MAP_ID,
  chroniclesClearRuntimeMapDefinitions,
  chroniclesInstallRuntimeMapDefinition,
  chroniclesMapById,
} from './chroniclesMapCatalog.js';

export const CHRONICLES_BOOTSTRAP_BUDGET_MS = 250;

function localBootstrap(mapId, seed, fallbackReason) {
  return Object.freeze({
    source: 'local',
    map: chroniclesMapById(mapId),
    seed,
    fallbackReason,
  });
}

export async function chroniclesBootstrapTacticsWorld({
  mapId = DEFAULT_CHRONICLES_MAP_ID,
  seed = 0,
  budgetMs = CHRONICLES_BOOTSTRAP_BUDGET_MS,
  signal,
  resolveArea = api.resolveChroniclesAreaManifest,
} = {}) {
  // Every entry starts from the bundled fallback. A remote definition is only
  // installed if it wins the bounded bootstrap race before gameplay mounts.
  chroniclesClearRuntimeMapDefinitions();
  if (signal?.aborted) return localBootstrap(mapId, seed, 'aborted');

  const requestController = new AbortController();
  const abortRequest = () => requestController.abort();
  signal?.addEventListener('abort', abortRequest, { once: true });

  let deadlineId;
  const deadline = new Promise((resolve) => {
    deadlineId = setTimeout(() => {
      requestController.abort();
      resolve(localBootstrap(mapId, seed, 'bootstrap-deadline'));
    }, Math.max(0, Number(budgetMs) || 0));
  });

  const request = Promise.resolve()
    .then(() => resolveArea(mapId, { seed, signal: requestController.signal }))
    .catch((error) => localBootstrap(
      mapId,
      seed,
      error instanceof Error ? error.message : 'remote-unavailable',
    ));

  let resolved;
  try {
    resolved = await Promise.race([request, deadline]);
  } finally {
    clearTimeout(deadlineId);
    signal?.removeEventListener('abort', abortRequest);
  }

  if (signal?.aborted) return localBootstrap(mapId, seed, 'aborted');
  if (resolved?.source !== 'remote') {
    return localBootstrap(mapId, seed, resolved?.fallbackReason || 'remote-unavailable');
  }

  const map = chroniclesInstallRuntimeMapDefinition(resolved.map);
  return Object.freeze({ ...resolved, map });
}

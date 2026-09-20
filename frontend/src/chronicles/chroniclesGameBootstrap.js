import { abortableDelay } from '../asyncControl.js';
import { chroniclesValidateAreaEnvelope } from './chroniclesGameDirector.js';
import {
  DEFAULT_CHRONICLES_MAP_ID,
  chroniclesClearRuntimeMapDefinitions,
  chroniclesInstallRuntimeMapDefinition,
  chroniclesMapById,
  chroniclesMapIds,
  chroniclesSetRuntimeEntryMapId,
} from './chroniclesMapCatalog.js';
import { chroniclesCreateRun } from './chroniclesRunClient.js';

export const CHRONICLES_BOOTSTRAP_BUDGET_MS = 5000;

export const CHRONICLES_BOOTSTRAP_ERROR_CODES = Object.freeze({
  timeout: 'CHR-BOOT-001',
  unavailable: 'CHR-BOOT-002',
  invalidWorld: 'CHR-BOOT-003',
  auth: 'CHR-BOOT-004',
  aborted: 'CHR-BOOT-005',
  unknown: 'CHR-BOOT-006',
});

const WORLD_INTEGRITY_REASONS = new Set([
  'missing-run',
  'invalid-run-id',
  'unknown-run-map',
  'run-map-mismatch',
  'invalid-run-seed',
  'invalid-world-version',
  'inactive-run',
  'run-version-mismatch',
  'run-revision-mismatch',
  'missing-area-bundle',
  'unknown-bundled-map',
  'duplicate-bundled-map',
  'incomplete-area-bundle',
  'current-area-bundle-mismatch',
]);

export class ChroniclesBootstrapError extends Error {
  constructor(code, reason, { cause = null, requestId = null, status = null } = {}) {
    super('No se pudo preparar una expedición autoritativa de Chronicles.');
    this.name = 'ChroniclesBootstrapError';
    this.code = code;
    this.reason = String(reason || 'unknown');
    this.requestId = requestId || null;
    this.status = Number.isInteger(status) ? status : null;
    this.cause = cause || undefined;
  }
}

function bootstrapErrorFor(error, { timedOut = false, aborted = false } = {}) {
  if (error instanceof ChroniclesBootstrapError) return error;
  const reason = String(error?.technicalMessage || error?.message || 'unknown');
  if (aborted) {
    return new ChroniclesBootstrapError(CHRONICLES_BOOTSTRAP_ERROR_CODES.aborted, 'aborted', { cause: error });
  }
  if (timedOut || error?.timedOut || error?.name === 'TimeoutError') {
    return new ChroniclesBootstrapError(CHRONICLES_BOOTSTRAP_ERROR_CODES.timeout, 'bootstrap-deadline', { cause: error });
  }
  if (error?.status === 401 || error?.status === 403) {
    return new ChroniclesBootstrapError(CHRONICLES_BOOTSTRAP_ERROR_CODES.auth, 'authorization-failed', {
      cause: error,
      requestId: error?.requestId,
      status: error?.status,
    });
  }
  if (WORLD_INTEGRITY_REASONS.has(reason)) {
    return new ChroniclesBootstrapError(CHRONICLES_BOOTSTRAP_ERROR_CODES.invalidWorld, reason, { cause: error });
  }
  return new ChroniclesBootstrapError(CHRONICLES_BOOTSTRAP_ERROR_CODES.unavailable, reason, {
    cause: error,
    requestId: error?.requestId,
    status: error?.status,
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
  budgetMs = CHRONICLES_BOOTSTRAP_BUDGET_MS,
  signal,
  operationId = null,
  createRun = chroniclesCreateRun,
} = {}) {
  chroniclesClearRuntimeMapDefinitions();
  if (signal?.aborted) {
    throw new ChroniclesBootstrapError(CHRONICLES_BOOTSTRAP_ERROR_CODES.aborted, 'aborted');
  }

  const requestController = new AbortController();
  const deadlineController = new AbortController();
  let deadlineExpired = false;
  let externallyAborted = false;

  const abortPending = () => {
    externallyAborted = true;
    requestController.abort();
    deadlineController.abort();
  };
  signal?.addEventListener('abort', abortPending, { once: true });

  const deadline = abortableDelay(Math.max(0, Number(budgetMs) || 0), deadlineController.signal)
    .then(() => {
      deadlineExpired = true;
      requestController.abort();
      return {
        ok: false,
        error: new ChroniclesBootstrapError(
          CHRONICLES_BOOTSTRAP_ERROR_CODES.timeout,
          'bootstrap-deadline',
        ),
      };
    })
    .catch(() => ({
      ok: false,
      error: bootstrapErrorFor(null, { aborted: externallyAborted }),
    }));

  const request = Promise.resolve()
    .then(() => createRun(mapId, { operationId, signal: requestController.signal }))
    .then((payload) => ({ ok: true, value: validateRunBootstrap(payload, mapId) }))
    .catch((error) => ({
      ok: false,
      error: bootstrapErrorFor(error, {
        timedOut: deadlineExpired,
        aborted: externallyAborted,
      }),
    }));

  let outcome;
  try {
    outcome = await Promise.race([request, deadline]);
  } finally {
    deadlineController.abort();
    signal?.removeEventListener('abort', abortPending);
  }

  if (!outcome?.ok) {
    chroniclesClearRuntimeMapDefinitions();
    throw outcome?.error || new ChroniclesBootstrapError(
      CHRONICLES_BOOTSTRAP_ERROR_CODES.unknown,
      'unknown',
    );
  }

  const resolved = outcome.value;
  resolved.areas.forEach((entry) => {
    chroniclesInstallRuntimeMapDefinition(entry.map);
  });
  chroniclesSetRuntimeEntryMapId(resolved.currentMapId);
  const map = chroniclesMapById(resolved.currentMapId);
  return Object.freeze({ ...resolved, map });
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
    .catch(() => localBootstrap(fallbackMapId, seed, signal?.aborted ? 'aborted' : 'bootstrap-cancelled'));

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
  chroniclesSetRuntimeEntryMapId(resolved.currentMapId);
  const map = chroniclesMapById(resolved.currentMapId);
  return Object.freeze({ ...resolved, map });
}

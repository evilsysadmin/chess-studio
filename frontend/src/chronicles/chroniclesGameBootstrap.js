import { abortableDelay } from '../asyncControl.js';
import { chroniclesValidateAreaEnvelope } from './chroniclesGameDirector.js';
import {
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

function bootstrapTransportError(error, { timedOut = false, aborted = false } = {}) {
  if (error instanceof ChroniclesBootstrapError) return error;
  const reason = String(error?.technicalMessage || error?.message || 'remote-unavailable');
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
  return new ChroniclesBootstrapError(CHRONICLES_BOOTSTRAP_ERROR_CODES.unavailable, reason, {
    cause: error,
    requestId: error?.requestId,
    status: error?.status,
  });
}

function validateAuthoritativeRun(payload, mapId) {
  try {
    return validateRunBootstrap(payload, mapId);
  } catch (error) {
    throw new ChroniclesBootstrapError(
      CHRONICLES_BOOTSTRAP_ERROR_CODES.invalidWorld,
      error instanceof Error ? error.message : 'invalid-world',
      { cause: error },
    );
  }
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
      error: bootstrapTransportError(null, { aborted: externallyAborted }),
    }));

  const request = Promise.resolve()
    .then(() => createRun(mapId, { operationId, signal: requestController.signal }))
    .then((payload) => ({ ok: true, value: validateAuthoritativeRun(payload, mapId) }))
    .catch((error) => ({
      ok: false,
      error: bootstrapTransportError(error, {
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
}

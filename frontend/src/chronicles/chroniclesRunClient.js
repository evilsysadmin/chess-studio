import { authHeader } from '../auth.js';
import { requestJson } from '../http.js';
import { chroniclesRunCheckpointPayload } from './chroniclesRunCheckpoint.js';

const BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000/api';

export function chroniclesCreateRun(mapId, { operationId = null, partyLevel = null, signal } = {}) {
  return requestJson(`${BASE_URL}/chronicles/runs`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(operationId ? { 'Idempotency-Key': operationId } : {}),
      ...(Number.isInteger(partyLevel) ? { 'X-Chronicles-Party-Level': String(partyLevel) } : {}),
      ...authHeader(),
    },
    body: JSON.stringify(mapId ? { mapId } : {}),
    signal,
  });
}


export function chroniclesCheckpointRun(runId, checkpoint, { signal } = {}) {
  return requestJson(`${BASE_URL}/chronicles/runs/${encodeURIComponent(runId)}/checkpoint`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      ...authHeader(),
    },
    body: JSON.stringify(checkpoint),
    signal,
  });
}


export function chroniclesCheckpointState(runId, state, worldVersion, options = {}) {
  const { terminalStatus = null, ...transportOptions } = options;
  return chroniclesCheckpointRun(
    runId,
    chroniclesRunCheckpointPayload(state, worldVersion, { terminalStatus }),
    transportOptions,
  );
}

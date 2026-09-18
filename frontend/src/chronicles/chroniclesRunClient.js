import { authHeader } from '../auth.js';
import { requestJson } from '../http.js';

const BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000/api';

export function chroniclesCreateRun(mapId, { operationId = null, signal } = {}) {
  return requestJson(`${BASE_URL}/chronicles/runs`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(operationId ? { 'Idempotency-Key': operationId } : {}),
      ...authHeader(),
    },
    body: JSON.stringify(mapId ? { mapId } : {}),
    signal,
  });
}

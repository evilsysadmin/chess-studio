import { APP_RELEASE } from './release.js';

export function newRequestId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return `web-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function withRequestId(headers = {}) {
  return {
    ...headers,
    'X-Request-ID': newRequestId(),
    ...(APP_RELEASE ? { 'X-Client-Release': APP_RELEASE } : {}),
  };
}

export function requestErrorMessage(response, body = {}) {
  const requestId = response.headers?.get?.('x-request-id') || body.requestId || null;
  const detail = body.detail;
  const base = (detail && typeof detail === 'object' ? detail.message : detail) || body.error || `Error ${response.status}`;
  return { message: requestId ? `${base} · Ref: ${requestId}` : base, requestId };
}

export function newRequestId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return `web-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function withRequestId(headers = {}) {
  return { ...headers, 'X-Request-ID': newRequestId() };
}

export function requestErrorMessage(response, body = {}) {
  const requestId = response.headers?.get?.('x-request-id') || body.requestId || null;
  const base = body.detail || body.error || `Error ${response.status}`;
  return { message: requestId ? `${base} · Ref: ${requestId}` : base, requestId };
}

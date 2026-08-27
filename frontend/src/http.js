import { withRequestId, requestErrorMessage } from './requestId.js';
import { userFacingError } from './userFacingError.js';

export const DEFAULT_REQUEST_TIMEOUT_MS = 20000;

function requestAbortGuard(signal, timeoutMs) {
  const duration = Number(timeoutMs);
  const useTimeout = Number.isFinite(duration) && duration > 0;
  if (!useTimeout && !signal) return { signal: undefined, cleanup() {}, timedOut: () => false };

  const controller = new AbortController();
  let timeoutId = null;
  let didTimeout = false;
  const forwardAbort = () => controller.abort(signal?.reason);

  if (signal) {
    if (signal.aborted) forwardAbort();
    else signal.addEventListener('abort', forwardAbort, { once: true });
  }
  if (useTimeout) {
    timeoutId = setTimeout(() => {
      didTimeout = true;
      controller.abort(new DOMException('Request timeout', 'TimeoutError'));
    }, duration);
  }

  return {
    signal: controller.signal,
    timedOut: () => didTimeout,
    cleanup() {
      if (timeoutId !== null) clearTimeout(timeoutId);
      signal?.removeEventListener?.('abort', forwardAbort);
    },
  };
}

export async function request(url, options = {}) {
  const {
    headers = {},
    timeoutMs = DEFAULT_REQUEST_TIMEOUT_MS,
    signal: externalSignal,
    ...rest
  } = options;
  const guard = requestAbortGuard(externalSignal, timeoutMs);
  try {
    return await fetch(url, { ...rest, headers: withRequestId(headers), signal: guard.signal });
  } catch (cause) {
    const timeoutCause = guard.timedOut()
      ? new Error(`Request timeout after ${Math.round(Number(timeoutMs))} ms`)
      : cause;
    if (guard.timedOut()) timeoutCause.name = 'TimeoutError';
    const error = new Error(userFacingError(timeoutCause));
    error.cause = timeoutCause;
    error.name = timeoutCause?.name || error.name;
    error.timedOut = guard.timedOut();
    throw error;
  } finally {
    guard.cleanup();
  }
}

async function parseJsonResponse(response) {
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const { message, requestId } = requestErrorMessage(response, body);
    const error = new Error(message);
    error.status = response.status;
    error.requestId = requestId;
    error.body = body;
    error.technicalMessage = message;
    error.message = userFacingError(error, message);
    throw error;
  }
  return body;
}

export async function requestJson(url, options = {}) {
  return parseJsonResponse(await request(url, options));
}

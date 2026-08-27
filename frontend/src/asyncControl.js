export function isAbortError(error) {
  return error?.name === 'AbortError' || error?.cause?.name === 'AbortError';
}

function abortError(message = 'Aborted') {
  if (typeof DOMException === 'function') return new DOMException(message, 'AbortError');
  const error = new Error(message);
  error.name = 'AbortError';
  return error;
}

export function abortableDelay(ms, signal) {
  const duration = Math.max(0, Number(ms) || 0);
  if (signal?.aborted) return Promise.reject(signal.reason || abortError());
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      signal?.removeEventListener?.('abort', onAbort);
      resolve();
    }, duration);
    const onAbort = () => {
      clearTimeout(timer);
      signal?.removeEventListener?.('abort', onAbort);
      reject(signal.reason || abortError());
    };
    signal?.addEventListener?.('abort', onAbort, { once: true });
  });
}

// Watchdog para APIs del navegador que devuelven/canalizan Promises pero no
// aceptan AbortSignal (clipboard, canvas.toBlob adaptado a Promise, etc.). No
// puede cancelar el trabajo subyacente, pero sí impide que la UI espere para
// siempre. Si se aporta signal, un cambio de pantalla gana inmediatamente.
export function withTimeout(promise, timeoutMs = 10000, { signal, message = 'Operation timed out' } = {}) {
  const duration = Math.max(1, Number(timeoutMs) || 10000);
  if (signal?.aborted) return Promise.reject(signal.reason || abortError());
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (fn, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal?.removeEventListener?.('abort', onAbort);
      fn(value);
    };
    const onAbort = () => finish(reject, signal.reason || abortError());
    const timer = setTimeout(() => {
      const error = new Error(message);
      error.name = 'TimeoutError';
      error.timeout = true;
      error.timeoutMs = duration;
      finish(reject, error);
    }, duration);
    signal?.addEventListener?.('abort', onAbort, { once: true });
    Promise.resolve(promise).then(
      (value) => finish(resolve, value),
      (error) => finish(reject, error),
    );
  });
}

// Wrapper pequeño para los pocos fetch() intencionadamente inyectables que no
// pasan por http.js (release.json, métricas admin, telemetría best-effort...).
// Mantiene el mismo principio que el cliente HTTP principal: ninguna petición
// puede vivir para siempre y una cancelación externa sigue teniendo prioridad.
export async function fetchWithTimeout(fetchImpl, url, options = {}, timeoutMs = 20000) {
  if (typeof fetchImpl !== 'function') throw new TypeError('fetchImpl must be a function');
  const controller = new AbortController();
  const externalSignal = options?.signal;
  const duration = Math.max(1, Number(timeoutMs) || 20000);
  let timedOut = false;

  const onExternalAbort = () => controller.abort(externalSignal.reason || abortError());
  if (externalSignal?.aborted) onExternalAbort();
  else externalSignal?.addEventListener?.('abort', onExternalAbort, { once: true });

  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort(abortError(`Request timed out after ${duration} ms`));
  }, duration);

  try {
    return await fetchImpl(url, { ...options, signal: controller.signal });
  } catch (error) {
    if (timedOut && isAbortError(error)) {
      error.timeout = true;
      error.timeoutMs = duration;
    }
    throw error;
  } finally {
    clearTimeout(timer);
    externalSignal?.removeEventListener?.('abort', onExternalAbort);
  }
}

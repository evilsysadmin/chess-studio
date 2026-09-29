// transientRetry.js — Reintento automático SÓLO para operaciones idempotentes.
//
// Contrato (docs/operations/resilience-degraded-mode.md): "Reintentos sólo son
// automáticos cuando la operación es idempotente o lleva idempotency/CAS suficiente".
// El backend de partidas guarda un ledger por Idempotency-Key (operation_replay), así
// que repetir el MISMO POST con la MISMA clave devuelve la respuesta ya aplicada en vez
// de mover dos veces. Sin clave no se reintenta ninguna mutación.
//
// Qué cuenta como transitorio:
// - fallo de red (fetch rechazado sin status HTTP): típico de un deploy del backend,
//   donde el túnel de Cloudflare responde sin cabeceras CORS y el navegador sólo ve
//   "Failed to fetch";
// - 502/503/504 y la familia 52x de Cloudflare (origen caído, túnel 530...).
// No se reintentan 4xx (reglas, auth, conflicto CAS 409), ni timeouts del cliente
// (la jugada puede seguir calculándose; duplicar carga del motor no ayuda), ni aborts.

export const TRANSIENT_RETRY_DELAYS_MS = Object.freeze([500, 1000, 2000, 4000, 8000, 8000]);

const TRANSIENT_STATUSES = new Set([502, 503, 504, 520, 521, 522, 523, 524, 525, 526, 527, 530]);

function isAbort(error) {
  return error?.name === 'AbortError' || error?.cause?.name === 'AbortError';
}

export function isTransientFailure(error) {
  if (!error || isAbort(error) || error.timedOut) return false;
  if (typeof error.status === 'number') return TRANSIENT_STATUSES.has(error.status);
  // Sin status: fetch rechazó antes de tener respuesta (red / CORS opaco).
  return true;
}

function wait(ms, signal) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(signal.reason ?? new DOMException('Aborted', 'AbortError'));
      return;
    }
    const id = setTimeout(() => {
      signal?.removeEventListener?.('abort', onAbort);
      resolve();
    }, ms);
    function onAbort() {
      clearTimeout(id);
      reject(signal.reason ?? new DOMException('Aborted', 'AbortError'));
    }
    signal?.addEventListener?.('abort', onAbort, { once: true });
  });
}

/**
 * Ejecuta `attempt()` y lo repite ante fallos transitorios.
 * `idempotent` debe ser true sólo si repetir la llamada es seguro (GET, o mutación con
 * Idempotency-Key estable entre intentos). Si es false se comporta como una llamada normal.
 */
export async function withTransientRetry(attempt, { idempotent, signal, delays = TRANSIENT_RETRY_DELAYS_MS, onRetry } = {}) {
  let lastError;
  for (let i = 0; ; i += 1) {
    try {
      return await attempt();
    } catch (error) {
      lastError = error;
      // Si el caller ya abandonó la operación, la causa relevante es su abort, no el fallo de red.
      if (signal?.aborted && idempotent && isTransientFailure(error)) throw signal.reason ?? error;
      if (!idempotent || i >= delays.length || !isTransientFailure(error) || signal?.aborted) throw error;
      onRetry?.({ attempt: i + 1, delayMs: delays[i], error });
      await wait(delays[i], signal);
    }
  }
  // eslint-disable-next-line no-unreachable
  throw lastError;
}

import { connectionErrorCopy, isConnectionFailure } from './networkErrorCopy.js';

function cleanRequestId(value) {
  const id = String(value || '').trim();
  return /^[A-Za-z0-9._:-]{4,120}$/.test(id) ? id : '';
}

export function userFacingError(error, fallback = 'No se pudo completar la operación.') {
  if (isConnectionFailure(error)) return connectionErrorCopy(error);

  const status = Number(error?.status);
  const requestId = cleanRequestId(error?.requestId);
  const reference = requestId ? ` Referencia: ${requestId}.` : '';

  if (status === 401) return 'Tu sesión ha caducado. Vuelve a iniciar sesión para continuar.';
  if (status === 403) return 'Esta cuenta no tiene permiso para realizar esa acción.';
  if (status === 429) return `Chess Studio ha recibido demasiadas solicitudes seguidas. Espera un momento y reintenta.${reference}`;
  if (status >= 500) return `Chess Studio ha tenido un problema al procesar esto. Tu progreso guardado no se borra; reintenta en unos segundos.${reference}`;

  const message = String(error?.message || '').trim();
  if (message && !/failed to fetch|networkerror|traceback|exception|undefined|null is not|cannot read/i.test(message)) {
    return message;
  }
  return fallback;
}

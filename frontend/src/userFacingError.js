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

  const message = String(error?.message || '').trim();

  // Un 401 en una petición que YA llevaba credenciales significa sesión
  // caducada/invalidada. En endpoints públicos de autenticación (login,
  // reset, etc.) el mismo status expresa un error de negocio y debemos
  // conservar el detalle seguro del backend (por ejemplo, credenciales
  // incorrectas) en vez de decir absurdamente que ha caducado una sesión
  // que todavía no existe.
  if (status === 401) {
    if (error?.authenticatedRequest) return 'Tu sesión ha caducado. Vuelve a iniciar sesión para continuar.';
    if (message && !/failed to fetch|networkerror|traceback|exception|undefined|null is not|cannot read/i.test(message)) return message;
    return fallback;
  }
  if (status === 403) return 'Esta cuenta no tiene permiso para realizar esa acción.';
  if (status === 429) return `Chess Studio ha recibido demasiadas solicitudes seguidas. Espera un momento y reintenta.${reference}`;
  if (status >= 500) return `Chess Studio ha tenido un problema al procesar esto. Tu progreso guardado no se borra; reintenta en unos segundos.${reference}`;

  if (message && !/failed to fetch|networkerror|traceback|exception|undefined|null is not|cannot read/i.test(message)) {
    return message;
  }
  return fallback;
}

// Copy estable para fallos que ocurren antes de recibir una respuesta HTTP.
// No enseñamos "Failed to fetch": no ayuda al jugador a recuperarse ni aporta
// un identificador que soporte pueda rastrear.
export function isConnectionFailure(error) {
  if (!error) return false;
  const message = String(error?.message || error);
  // A runtime TypeError ('cannot read property', etc.) is not evidence of a
  // connection failure. Only well-known browser/network messages qualify.
  return /failed to fetch|fetch failed|networkerror|network request failed|load failed|offline|timeout|timed out/i.test(message);
}

export function connectionErrorCopy(error, language = 'es') {
  if (!isConnectionFailure(error)) return String(error?.message || error || 'No se pudo completar la operación.');
  return language === 'en'
    ? 'We could not reach Chess Studio. Check your connection and try again. We cannot confirm whether the operation completed.'
    : 'No hemos podido conectar con Chess Studio. Comprueba tu conexión y vuelve a intentarlo. No podemos confirmar si la operación llegó a completarse.';
}

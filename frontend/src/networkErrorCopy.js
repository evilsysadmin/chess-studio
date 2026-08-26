// Copy estable para fallos que ocurren antes de recibir una respuesta HTTP.
// No enseñamos "Failed to fetch": no ayuda al jugador a recuperarse ni aporta
// un identificador que soporte pueda rastrear.
export function isConnectionFailure(error) {
  if (!error) return false;
  const message = String(error?.message || error);
  return error instanceof TypeError
    || /failed to fetch|networkerror|network request failed|load failed|offline|timeout|timed out/i.test(message);
}

export function connectionErrorCopy(error, language = 'es') {
  if (!isConnectionFailure(error)) return String(error?.message || error || 'No se pudo completar la operación.');
  return language === 'en'
    ? 'We could not reach Chess Studio. Check your connection and try again. Your account and progress are safe.'
    : 'No hemos podido conectar con Chess Studio. Comprueba tu conexión y vuelve a intentarlo. Tu cuenta y tu progreso están a salvo.';
}

// Orquestación testeable del logout: presencia se cierra en cuanto el usuario
// confirma la salida, pero el perfil todavía tiene oportunidad de guardarse.
// Si ese guardado falla y mantenemos la sesión abierta, reanunciamos presencia
// para no dejar al usuario como offline mientras sigue usando la aplicación.
export async function runLogoutLifecycle({
  saveProfile,
  closePresence,
  restorePresence,
  clearSession,
} = {}) {
  let presencePromise;
  try {
    // Invocación síncrona deliberada: no esperamos al guardado para sacar la
    // sesión del contador de presencia.
    presencePromise = Promise.resolve(closePresence?.());
  } catch {
    presencePromise = Promise.resolve(false);
  }

  try {
    await saveProfile?.();
    await presencePromise.catch(() => false);
    clearSession?.();
    return { loggedOut: true, reason: 'saved' };
  } catch (error) {
    await presencePromise.catch(() => false);
    if (error?.status === 401) {
      clearSession?.();
      return { loggedOut: true, reason: 'unauthorized' };
    }
    try { restorePresence?.(); } catch { /* presencia es best-effort */ }
    throw error;
  }
}

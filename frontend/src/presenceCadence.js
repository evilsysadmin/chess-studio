export const PRESENCE_HEARTBEAT_MS = 120000;
// El panel admin puede releer presencia con más frecuencia sin pedir a los
// clientes que envíen más telemetría. Así el contador reacciona rápido a
// login/logout y el heartbeat del usuario sigue siendo deliberadamente grueso.
export const ADMIN_REFRESH_MS = 30000;

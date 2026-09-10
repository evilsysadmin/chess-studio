export const ACTIVE_SESSION_ROUTES = Object.freeze(['game', 'tournamentGame']);

export function isActiveSessionRoute(route) {
  return ACTIVE_SESSION_ROUTES.includes(route);
}

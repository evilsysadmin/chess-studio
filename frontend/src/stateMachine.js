import { sendFrontendTelemetry } from './frontendTelemetry.js';
export { strictInvariant, transition } from './stateTransition.js';

export function reportStateInvariant(domain, code, details = {}) {
  const safeDomain = String(domain || 'state').replace(/[^A-Za-z0-9_.-]/g, '').slice(0, 32) || 'state';
  const safeCode = String(code || 'invalid').replace(/[^A-Za-z0-9_.-]/g, '').slice(0, 48) || 'invalid';
  // Nunca incluimos FEN, movimientos, usuario ni payload de partida en telemetría.
  const summary = Object.fromEntries(Object.entries(details || {}).filter(([key, value]) => (
    ['state', 'event', 'route', 'phase', 'reason'].includes(key)
    && ['string', 'number', 'boolean'].includes(typeof value)
  )));
  // eslint-disable-next-line no-console
  console.error(`[StateInvariant] ${safeDomain}:${safeCode}`, summary);
  sendFrontendTelemetry('state_invariant', { errorName: `${safeDomain}:${safeCode}` });
  return { domain: safeDomain, code: safeCode, details: summary };
}

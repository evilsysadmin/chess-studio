/** Pure transition/invariant helpers. No React, storage, telemetry or chess deps. */
export function transition(table, state, event) {
  const next = table?.[state]?.[event];
  if (!next) return { ok: false, state, event, nextState: state };
  return { ok: true, state, event, nextState: next };
}

export function strictInvariant(condition, message) {
  if (!condition) throw new Error(`State invariant failed: ${message}`);
  return true;
}

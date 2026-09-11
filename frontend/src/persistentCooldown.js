export function persistentCooldownRemainingMs({ now = Date.now(), lastAt = null, durationMs = 0 } = {}) {
  const current = Number(now);
  const last = Number(lastAt);
  const duration = Math.max(0, Number(durationMs) || 0);
  if (!Number.isFinite(current) || !Number.isFinite(last) || last <= 0 || duration <= 0) return 0;
  // A timestamp written while the device clock was ahead is not trustworthy
  // cooldown evidence after the clock is corrected backwards.
  if (last > current) return 0;
  return Math.max(0, duration - (current - last));
}

export function persistentCooldownActive(options = {}) {
  return persistentCooldownRemainingMs(options) > 0;
}

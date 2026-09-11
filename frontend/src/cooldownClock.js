function finiteMs(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

export function cooldownStateFromTimestamp({ now, last, cooldownMs } = {}) {
  const current = finiteMs(now);
  const previous = finiteMs(last);
  const duration = Math.max(0, finiteMs(cooldownMs) ?? 0);

  if (current === null || previous === null || previous <= 0 || duration <= 0 || previous > current) {
    return { allowed: true, retryAfterMs: 0, nextAllowedAt: null };
  }

  const elapsed = Math.max(0, current - previous);
  const remaining = Math.max(0, duration - elapsed);

  return {
    allowed: remaining <= 0,
    retryAfterMs: remaining,
    nextAllowedAt: remaining > 0 ? previous + duration : null,
  };
}

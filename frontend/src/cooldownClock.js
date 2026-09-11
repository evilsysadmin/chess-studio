function finiteMs(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

export function cooldownStateFromTimestamp({ now, last, cooldownMs } = {}) {
  const current = finiteMs(now);
  const previous = finiteMs(last);
  const duration = Math.max(0, finiteMs(cooldownMs) ?? 0);

  if (current === null || previous === null || previous <= 0 || duration <= 0) {
    return { allowed: true, retryAfterMs: 0, nextAllowedAt: null };
  }

  // Si el reloj local retrocede, no permitimos que el cooldown crezca por
  // encima de su duración nominal. Anclamos el último evento al "ahora"
  // observado y como máximo volvemos a exigir un cooldown completo.
  const effectiveLast = Math.min(previous, current);
  const elapsed = Math.max(0, current - effectiveLast);
  const remaining = Math.max(0, duration - elapsed);

  return {
    allowed: remaining <= 0,
    retryAfterMs: remaining,
    nextAllowedAt: remaining > 0 ? effectiveLast + duration : null,
  };
}

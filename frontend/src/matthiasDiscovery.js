export const MATTHIAS_DISCOVERY_DEFAULT_COOLDOWN_MS = 8 * 60 * 60 * 1000;

const GENERIC_THRESHOLDS = Object.freeze({
  newcomer: 0.40,
  acquainted: 0.32,
  regular: 0.24,
  veteran: 0.18,
});

export function matthiasDiscoveryChance({ relationshipTier = 'newcomer', relevance = 'generic' } = {}) {
  if (relevance === 'meaningful') return 0.42;
  return GENERIC_THRESHOLDS[relationshipTier] ?? 0.30;
}

export function shouldSurfaceMatthias({
  blocked = false,
  sessionSeen = false,
  lastShownAt = null,
  now = Date.now(),
  cooldownMs = MATTHIAS_DISCOVERY_DEFAULT_COOLDOWN_MS,
  randomValue = Math.random(),
  relationshipTier = 'newcomer',
  relevance = 'generic',
} = {}) {
  if (blocked || sessionSeen) return false;

  const current = Number(now);
  const last = Number(lastShownAt || 0);
  const cooldown = Math.max(0, Number(cooldownMs) || 0);
  // A corrected device clock must not leave Matthias muted until a timestamp
  // written by the old (future) clock finally arrives. Treat future values as
  // invalid cooldown evidence; the next real exposure rewrites the timestamp.
  if (last > 0 && Number.isFinite(current) && last <= current && current - last < cooldown) return false;

  return Number(randomValue) < matthiasDiscoveryChance({ relationshipTier, relevance });
}

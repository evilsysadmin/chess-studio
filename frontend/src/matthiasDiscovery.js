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

  const last = Number(lastShownAt || 0);
  const cooldown = Math.max(0, Number(cooldownMs) || 0);
  if (last > 0 && now - last < cooldown) return false;

  return Number(randomValue) < matthiasDiscoveryChance({ relationshipTier, relevance });
}

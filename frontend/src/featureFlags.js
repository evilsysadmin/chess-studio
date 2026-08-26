export const DEFAULT_FEATURE_FLAGS = Object.freeze({
  homeGuide: true,
  postGameFeedback: true,
  rivalGhost: true,
  spectator: true,
});

export function normalizeFeatureFlags(payload) {
  const source = payload?.features && typeof payload.features === 'object' ? payload.features : payload;
  if (!source || typeof source !== 'object') return { ...DEFAULT_FEATURE_FLAGS };
  return Object.fromEntries(
    Object.entries(DEFAULT_FEATURE_FLAGS).map(([key, defaultValue]) => [
      key,
      typeof source[key] === 'boolean' ? source[key] : defaultValue,
    ]),
  );
}

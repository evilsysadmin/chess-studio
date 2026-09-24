// Real frame-time quality tiers for the War Room. Until now the room only chose "lite" at
// build time from touch / software rendering, and at runtime could shave the pixel ratio a
// little (never below 0.9 on desktop). A slow desktop GPU therefore kept every effect.
// The governor watches contiguous frame cadence and tightens full -> reduced -> lite;
// it never loosens, so a hot device does not flap between tiers. Tiers: full, reduced, lite.
const PROFILES = Object.freeze({
  desktop: Object.freeze({
    warmup: 45, sample: 90, slowMs: 26, slowRatio: 0.30,
    p90: Object.freeze({ full: 36, reduced: 48 }),
  }),
  coarse: Object.freeze({
    warmup: 45, sample: 90, slowMs: 42, slowRatio: 0.30,
    p90: Object.freeze({ full: 55, reduced: 70 }),
  }),
});

// Gaps at or above this are UI pauses (a click, a tab switch), not GPU cadence.
const CONTIGUOUS_MAX_MS = 80;

const PIXEL_RATIO_CAP = Object.freeze({
  desktop: Object.freeze({ reduced: 1.0, lite: 0.75 }),
  coarse: Object.freeze({ reduced: 0.85, lite: 0.7 }),
});

const SHADOW_INTERVAL_FACTOR = Object.freeze({ full: 1, reduced: 2.5, lite: 6 });

export function warRoomShadowIntervalFactor(tier = 'full') {
  return SHADOW_INTERVAL_FACTOR[tier] ?? 1;
}

function percentile90(values) {
  const ordered = [...values].sort((a, b) => a - b);
  return ordered[Math.max(0, Math.ceil(ordered.length * 0.9) - 1)] ?? 0;
}

export function createWarRoomQualityGovernor({ coarsePointer = false } = {}) {
  const profile = coarsePointer ? PROFILES.coarse : PROFILES.desktop;
  let tier = 'full';
  let warm = 0;
  let samples = [];

  const evaluate = () => {
    const limit = profile.p90[tier];
    const slow = samples.filter((ms) => ms >= profile.slowMs).length / samples.length;
    return slow >= profile.slowRatio || percentile90(samples) >= limit;
  };

  return {
    get tier() { return tier; },
    /** Feed the time since the previous render; returns the new tier only when it changes. */
    observe(frameMs) {
      if (tier === 'lite') return null;
      if (!Number.isFinite(frameMs) || frameMs <= 0 || frameMs >= CONTIGUOUS_MAX_MS) return null;
      if (warm < profile.warmup) {
        warm += 1;
        return null;
      }
      samples.push(frameMs);
      if (samples.length < profile.sample) return null;
      if (evaluate()) {
        tier = tier === 'full' ? 'reduced' : 'lite';
        samples = [];
        warm = Math.floor(profile.warmup / 2); // let the cheaper tier settle before judging it
        return tier;
      }
      samples = samples.slice(Math.floor(samples.length / 2));
      return null;
    },
  };
}

const SPRITE_NAME = /(fire-sprites|candle-sprites)$/;

/**
 * Shed effects for a tier: soft fire sprites (full only), the pixel ratio, and shadows at lite.
 * Everything is reversible flags (visible / pixel ratio), no geometry is disposed.
 */
export function applyWarRoomQualityTier(renderer, scene, tier, { coarsePointer = false } = {}) {
  const caps = coarsePointer ? PIXEL_RATIO_CAP.coarse : PIXEL_RATIO_CAP.desktop;
  scene?.traverse?.((object) => {
    if (SPRITE_NAME.test(object.name || '')) object.visible = tier === 'full';
  });
  if (tier !== 'full' && typeof renderer?.setPixelRatio === 'function') {
    const cap = caps[tier];
    const current = typeof renderer.getPixelRatio === 'function' ? renderer.getPixelRatio() : cap;
    if (cap < current) renderer.setPixelRatio(cap);
  }
  if (tier === 'lite' && renderer?.shadowMap) renderer.shadowMap.enabled = false;
  if (scene?.userData) scene.userData.warRoomQualityTier = tier;
  if (renderer?.domElement?.dataset) renderer.domElement.dataset.warRoomQualityTier = tier;
  return tier;
}

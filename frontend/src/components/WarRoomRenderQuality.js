import { getRenderQualityPreference } from '../userPreferences.js';

export const WAR_ROOM_RENDER_QUALITY_TIERS = Object.freeze(['low', 'medium', 'high', 'ultra']);

function finitePositive(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
}

export function readWarRoomHardwareHints({
  navigatorLike = typeof navigator !== 'undefined' ? navigator : null,
  windowLike = typeof window !== 'undefined' ? window : null,
} = {}) {
  return Object.freeze({
    deviceMemory: finitePositive(navigatorLike?.deviceMemory),
    hardwareConcurrency: finitePositive(navigatorLike?.hardwareConcurrency),
    coarsePointer: Boolean(windowLike?.matchMedia?.('(pointer: coarse)')?.matches),
    viewportWidth: finitePositive(windowLike?.innerWidth),
    viewportHeight: finitePositive(windowLike?.innerHeight),
    devicePixelRatio: finitePositive(windowLike?.devicePixelRatio) || 1,
  });
}

export function resolveWarRoomAutoRenderQuality({
  deviceMemory,
  hardwareConcurrency,
  coarsePointer = false,
  viewportWidth,
  viewportHeight,
  devicePixelRatio = 1,
  softwareRenderer = false,
  maxTextureSize,
} = {}) {
  if (softwareRenderer) return 'low';

  let score = 0;
  const memory = finitePositive(deviceMemory);
  const cores = finitePositive(hardwareConcurrency);
  const width = finitePositive(viewportWidth);
  const height = finitePositive(viewportHeight);
  const dpr = finitePositive(devicePixelRatio) || 1;
  const textureSize = finitePositive(maxTextureSize);

  if (memory != null) {
    if (memory >= 8) score += 2;
    else if (memory >= 6) score += 1;
    else if (memory <= 2) score -= 2;
    else if (memory <= 4) score -= 1;
  }

  if (cores != null) {
    if (cores >= 8) score += 2;
    else if (cores >= 6) score += 1;
    else if (cores <= 2) score -= 2;
    else if (cores <= 4) score -= 1;
  }

  if (textureSize != null) {
    if (textureSize >= 16384) score += 1;
    else if (textureSize < 4096) score -= 2;
  }

  if (width != null && height != null) {
    const cssPixels = width * height;
    const backingPixels = cssPixels * dpr * dpr;
    if (backingPixels >= 7_000_000) score -= 1;
    if (Math.min(width, height) < 360) score -= 1;
  }

  // Touch is an interaction signal, not a verdict on GPU power. Only combine
  // it with genuinely weak CPU evidence so high-end Android can still reach
  // High/Ultra in Auto.
  if (coarsePointer && cores != null && cores <= 4) score -= 1;

  if (score >= 5) return 'ultra';
  if (score >= 2) return 'high';
  if (score >= 0) return 'medium';
  return 'low';
}

export function resolveWarRoomRenderQuality({
  preference = getRenderQualityPreference(),
  ...hardware
} = {}) {
  if (WAR_ROOM_RENDER_QUALITY_TIERS.includes(preference)) return preference;
  return resolveWarRoomAutoRenderQuality(hardware);
}

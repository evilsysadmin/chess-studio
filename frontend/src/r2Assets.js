import manifest from './assets/r2-assets-manifest.json';

export const R2_ASSET_BASE_URL = manifest.baseUrl;

export function r2AssetEntry(logicalId) {
  if (typeof logicalId !== 'string' || !logicalId) return null;
  const entry = manifest.assets?.[logicalId];
  return entry && typeof entry === 'object' ? entry : null;
}

export function r2AssetUrl(logicalId, fallbackUrl = '') {
  const entry = r2AssetEntry(logicalId);
  if (!entry || typeof entry.url !== 'string') return fallbackUrl;
  try {
    const parsed = new URL(entry.url);
    if (parsed.protocol !== 'https:') return fallbackUrl;
    return parsed.href;
  } catch {
    return fallbackUrl;
  }
}

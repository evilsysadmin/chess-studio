import { APP_BUILD_ID } from './release.js';
import { fetchWithTimeout } from './asyncControl.js';
import { normalizeReleaseIdentity, releaseIdentity } from './releaseManifest.js';

// Active tabs should learn about a deploy quickly even when the user keeps the
// same Chess Studio window open throughout a rollout. Focus/visibility signals
// make the common path immediate; this one-minute fallback closes the case
// where the tab simply remains visible and focused during the deploy.
export const RELEASE_CHECK_INTERVAL_MS = 60 * 1000;
export const RELEASE_CHECK_TIMEOUT_MS = 7000;

export function releaseManifestUrl(baseUrl = '/', now = Date.now()) {
  const base = String(baseUrl || '/').endsWith('/') ? String(baseUrl || '/') : `${String(baseUrl || '/')}/`;
  return `${base}release.json?ts=${Math.max(0, Number(now) || 0)}`;
}

// Historical name kept for callers/tests. The returned value is now the
// strongest available deployment identity: build SHA first, human release as
// compatibility fallback for local/older manifests.
export function normalizeLatestRelease(payload) {
  return releaseIdentity(payload);
}

export function isReleaseUpdateAvailable(latestRelease, currentRelease = APP_BUILD_ID) {
  const latest = normalizeReleaseIdentity(latestRelease);
  const current = normalizeReleaseIdentity(currentRelease);
  return Boolean(latest && current && latest !== current);
}

export async function fetchLatestRelease({
  fetchImpl = fetch,
  baseUrl = import.meta.env?.BASE_URL || '/',
  now = Date.now(),
  signal,
} = {}) {
  try {
    const response = await fetchWithTimeout(fetchImpl, releaseManifestUrl(baseUrl, now), {
      method: 'GET',
      cache: 'no-store',
      headers: { accept: 'application/json' },
      signal,
    }, RELEASE_CHECK_TIMEOUT_MS);
    if (!response?.ok) return null;
    return normalizeLatestRelease(await response.json());
  } catch {
    return null;
  }
}

import { APP_RELEASE } from './release.js';
import { fetchWithTimeout } from './asyncControl.js';

export const RELEASE_CHECK_INTERVAL_MS = 5 * 60 * 1000;
export const RELEASE_CHECK_TIMEOUT_MS = 7000;
const RELEASE_PATTERN = /^v[0-9A-Za-z][0-9A-Za-z._-]{0,30}$/;

export function releaseManifestUrl(baseUrl = '/', now = Date.now()) {
  const base = String(baseUrl || '/').endsWith('/') ? String(baseUrl || '/') : `${String(baseUrl || '/')}/`;
  return `${base}release.json?ts=${Math.max(0, Number(now) || 0)}`;
}

export function normalizeLatestRelease(payload) {
  const release = String(payload?.release || '').trim();
  return RELEASE_PATTERN.test(release) ? release : null;
}

export function isReleaseUpdateAvailable(latestRelease, currentRelease = APP_RELEASE) {
  const latest = String(latestRelease || '').trim();
  const current = String(currentRelease || '').trim();
  return Boolean(latest && current && latest !== current && RELEASE_PATTERN.test(latest));
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

import { APP_BUILD_ID } from './release.js';
import { fetchWithTimeout } from './asyncControl.js';
import { normalizeReleaseIdentity, releaseIdentity } from './releaseManifest.js';

export const RELEASE_CHECK_INTERVAL_MS = 5 * 60 * 1000;
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

export function bindReleaseUpdateSignals({
  check,
  windowObj = typeof window !== 'undefined' ? window : null,
  documentObj = typeof document !== 'undefined' ? document : null,
  intervalMs = RELEASE_CHECK_INTERVAL_MS,
} = {}) {
  if (!windowObj || !documentObj || typeof check !== 'function') return () => {};

  const checkIfVisible = () => {
    if (documentObj.visibilityState === 'visible') return check();
    return undefined;
  };

  const timer = windowObj.setInterval(checkIfVisible, intervalMs);
  documentObj.addEventListener('visibilitychange', checkIfVisible);
  // visibilitychange is not guaranteed when the browser window itself loses
  // and regains OS focus. A deploy can therefore remain unnoticed until the
  // five-minute poll unless focus explicitly triggers the same cheap manifest check.
  windowObj.addEventListener('focus', checkIfVisible);

  return () => {
    windowObj.clearInterval(timer);
    documentObj.removeEventListener('visibilitychange', checkIfVisible);
    windowObj.removeEventListener('focus', checkIfVisible);
  };
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

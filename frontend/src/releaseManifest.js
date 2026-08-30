export const RELEASE_PATTERN = /^v[0-9A-Za-z][0-9A-Za-z._-]{0,30}$/;
export const BUILD_SHA_PATTERN = /^[0-9a-f]{7,64}$/i;

export function normalizeRelease(value) {
  const release = String(value || '').trim();
  return RELEASE_PATTERN.test(release) ? release : null;
}

export function normalizeBuildSha(value) {
  const build = String(value || '').trim();
  return BUILD_SHA_PATTERN.test(build) ? build.toLowerCase() : null;
}

export function normalizeReleaseIdentity(value) {
  return normalizeBuildSha(value) || normalizeRelease(value);
}

export function releaseIdentity(payload) {
  return normalizeBuildSha(payload?.build) || normalizeRelease(payload?.release);
}

export function buildReleaseManifest({ release, buildSha } = {}) {
  const normalizedRelease = normalizeRelease(release);
  if (!normalizedRelease) throw new Error('Release manifest requires a valid release label');
  const build = normalizeBuildSha(buildSha);
  return build ? { release: normalizedRelease, build } : { release: normalizedRelease };
}

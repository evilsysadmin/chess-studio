export const LOCAL_GODOT_BOOTSTRAP_URL = '/games/pawn-slug-godot/index.html';
export const DEFAULT_GODOT_MANIFEST_URL = 'https://assets.chess-studio.shadowops.dpdns.org/pawn-slug-godot/current.json';

const RELEASE_RE = /^[0-9a-f]{16}$/;

function configuredDirectUrl(env = {}) {
  const value = env.VITE_PAWN_SLUG_GODOT_URL;
  return typeof value === 'string' && value.trim() ? value.trim() : '';
}

export function validatePawnSlugGodotManifest(value, manifestUrl = DEFAULT_GODOT_MANIFEST_URL) {
  if (!value || typeof value !== 'object' || value.version !== 1) {
    throw new Error('manifest Godot inválido: version');
  }
  if (typeof value.release !== 'string' || !RELEASE_RE.test(value.release)) {
    throw new Error('manifest Godot inválido: release');
  }
  if (typeof value.index !== 'string' || !value.index) {
    throw new Error('manifest Godot inválido: index');
  }

  const manifestOrigin = new URL(manifestUrl).origin;
  const indexUrl = new URL(value.index);
  const expectedPath = `/pawn-slug-godot/releases/${value.release}/index.html`;
  if (indexUrl.protocol !== 'https:' || indexUrl.origin !== manifestOrigin || indexUrl.pathname !== expectedPath) {
    throw new Error('manifest Godot inválido: index fuera del release esperado');
  }

  return {
    version: 1,
    release: value.release,
    index: indexUrl.href,
    sourceSha: typeof value.sourceSha === 'string' ? value.sourceSha : '',
  };
}

export async function resolvePawnSlugGodotUrl({
  env = import.meta.env,
  fetchImpl = globalThis.fetch,
  manifestUrl = DEFAULT_GODOT_MANIFEST_URL,
  now = Date.now,
} = {}) {
  const directUrl = configuredDirectUrl(env);
  if (directUrl) return { url: directUrl, source: 'override', release: '' };

  try {
    const requestUrl = new URL(manifestUrl);
    requestUrl.searchParams.set('v', String(now()));
    const response = await fetchImpl(requestUrl.href, {
      cache: 'no-store',
      credentials: 'omit',
    });
    if (!response?.ok) throw new Error(`manifest Godot HTTP ${response?.status || 0}`);
    const manifest = validatePawnSlugGodotManifest(await response.json(), manifestUrl);
    return { url: manifest.index, source: 'r2', release: manifest.release };
  } catch (error) {
    return {
      url: LOCAL_GODOT_BOOTSTRAP_URL,
      source: 'fallback',
      release: '',
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

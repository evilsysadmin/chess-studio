import { describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_GODOT_MANIFEST_URL,
  LOCAL_GODOT_BOOTSTRAP_URL,
  resolvePawnSlugGodotUrl,
  validatePawnSlugGodotManifest,
} from './pawnSlugGodotRuntime.js';

const RELEASE = '0123456789abcdef';
const VALID_MANIFEST = {
  version: 1,
  release: RELEASE,
  index: `https://assets.chess-studio.shadowops.dpdns.org/pawn-slug-godot/releases/${RELEASE}/index.html`,
  sourceSha: '0123456789abcdef0123456789abcdef01234567',
};

describe('Pawn Slug Godot runtime resolver', () => {
  it('respeta una URL directa sin consultar R2', async () => {
    const fetchImpl = vi.fn();
    const result = await resolvePawnSlugGodotUrl({
      env: { VITE_PAWN_SLUG_GODOT_URL: '/dev/godot/index.html' },
      fetchImpl,
    });

    expect(result).toEqual({ url: '/dev/godot/index.html', source: 'override', release: '' });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('resuelve el release inmutable publicado en R2 sin usar caché', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => VALID_MANIFEST,
    });
    const result = await resolvePawnSlugGodotUrl({ env: {}, fetchImpl, now: () => 42 });

    expect(result).toEqual({ url: VALID_MANIFEST.index, source: 'r2', release: RELEASE });
    expect(fetchImpl).toHaveBeenCalledWith(`${DEFAULT_GODOT_MANIFEST_URL}?v=42`, {
      cache: 'no-store',
      credentials: 'omit',
    });
  });

  it('rechaza un index que salga del origen/release esperado', () => {
    expect(() => validatePawnSlugGodotManifest({
      ...VALID_MANIFEST,
      index: `https://example.invalid/pawn-slug-godot/releases/${RELEASE}/index.html`,
    })).toThrow(/fuera del release esperado/);
  });

  it('degrada al bootstrap local si R2 aún no está disponible', async () => {
    const result = await resolvePawnSlugGodotUrl({
      env: {},
      fetchImpl: vi.fn().mockRejectedValue(new Error('offline')),
    });

    expect(result.url).toBe(LOCAL_GODOT_BOOTSTRAP_URL);
    expect(result.source).toBe('fallback');
    expect(result.error).toBe('offline');
  });
});

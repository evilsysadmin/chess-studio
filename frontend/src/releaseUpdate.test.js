import { describe, expect, it, vi } from 'vitest';
import {
  RELEASE_CHECK_INTERVAL_MS,
  fetchLatestRelease,
  isReleaseUpdateAvailable,
  normalizeLatestRelease,
  releaseManifestUrl,
} from './releaseUpdate.js';
import { buildReleaseManifest } from './releaseManifest.js';

describe('release update discovery', () => {
  it('acepta releases acotadas y prefiere un SHA de build válido', () => {
    expect(normalizeLatestRelease({ release: 'v16.6dm27' })).toBe('v16.6dm27');
    expect(normalizeLatestRelease({ release: 'v16.6dm27', build: 'ABCDEF1234567' })).toBe('abcdef1234567');
    expect(normalizeLatestRelease({ release: '<script>' })).toBeNull();
    expect(normalizeLatestRelease({ release: 'v16.6dm27', build: 'not-a-sha' })).toBe('v16.6dm27');
    expect(normalizeLatestRelease({})).toBeNull();
  });

  it('detecta despliegues distintos aunque compartan la misma release humana', () => {
    expect(isReleaseUpdateAvailable('2222222abcdef', '1111111abcdef')).toBe(true);
    expect(isReleaseUpdateAvailable('1111111abcdef', '1111111abcdef')).toBe(false);
    expect(isReleaseUpdateAvailable('v16.6dm27', 'v16.6dm26')).toBe(true);
    expect(isReleaseUpdateAvailable('v16.6dm27', 'v16.6dm27')).toBe(false);
  });

  it('mantiene un fallback visible suficientemente rápido para sesiones largas', () => {
    expect(RELEASE_CHECK_INTERVAL_MS).toBe(60_000);
  });

  it('construye un manifest de deploy con release humana y SHA técnico', () => {
    expect(buildReleaseManifest({ release: 'v16.6dm27', buildSha: 'ABCDEF1234567' })).toEqual({
      release: 'v16.6dm27',
      build: 'abcdef1234567',
    });
    expect(buildReleaseManifest({ release: 'v16.6dm27' })).toEqual({ release: 'v16.6dm27' });
    expect(() => buildReleaseManifest({ release: '<script>', buildSha: 'abcdef1234567' })).toThrow();
  });

  it('consulta release.json con cache busting y no-store', async () => {
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      json: async () => ({ release: 'v16.6dm27', build: '1234567abcdef' }),
    }));
    await expect(fetchLatestRelease({ fetchImpl, baseUrl: '/chess-studio/', now: 123 })).resolves.toBe('1234567abcdef');
    expect(fetchImpl).toHaveBeenCalledWith('/chess-studio/release.json?ts=123', expect.objectContaining({ cache: 'no-store' }));
    expect(releaseManifestUrl('/chess-studio', 9)).toBe('/chess-studio/release.json?ts=9');
  });

  it('falla en silencio si la comprobación no está disponible', async () => {
    await expect(fetchLatestRelease({ fetchImpl: vi.fn(async () => { throw new Error('offline'); }) })).resolves.toBeNull();
  });
});

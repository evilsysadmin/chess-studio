import { describe, expect, it, vi } from 'vitest';
import { fetchLatestRelease, isReleaseUpdateAvailable, normalizeLatestRelease, releaseManifestUrl } from './releaseUpdate.js';

describe('release update discovery', () => {
  it('acepta sólo releases acotadas y reconocibles', () => {
    expect(normalizeLatestRelease({ release: 'v16.6dm27' })).toBe('v16.6dm27');
    expect(normalizeLatestRelease({ release: '<script>' })).toBeNull();
    expect(normalizeLatestRelease({})).toBeNull();
  });

  it('detecta diferencia sin inventar orden semántico para releases internas', () => {
    expect(isReleaseUpdateAvailable('v16.6dm27', 'v16.6dm26')).toBe(true);
    expect(isReleaseUpdateAvailable('v16.6dm27', 'v16.6dm27')).toBe(false);
  });

  it('consulta release.json con cache busting y no-store', async () => {
    const fetchImpl = vi.fn(async () => ({ ok: true, json: async () => ({ release: 'v16.6dm27' }) }));
    await expect(fetchLatestRelease({ fetchImpl, baseUrl: '/chess-studio/', now: 123 })).resolves.toBe('v16.6dm27');
    expect(fetchImpl).toHaveBeenCalledWith('/chess-studio/release.json?ts=123', expect.objectContaining({ cache: 'no-store' }));
    expect(releaseManifestUrl('/chess-studio', 9)).toBe('/chess-studio/release.json?ts=9');
  });

  it('falla en silencio si la comprobación no está disponible', async () => {
    await expect(fetchLatestRelease({ fetchImpl: vi.fn(async () => { throw new Error('offline'); }) })).resolves.toBeNull();
  });
});

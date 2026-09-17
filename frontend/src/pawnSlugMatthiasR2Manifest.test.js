import { describe, expect, it } from 'vitest';
import manifest from './assets/r2-assets-manifest.json';

const REQUIRED = Object.freeze({
  'pawnSlug.matthias.canonicalMaster': 'image/png',
  'pawnSlug.matthias.pistol': 'image/webp',
  'pawnSlug.matthias.pistolShoot': 'image/webp',
  'pawnSlug.matthias.machinegun': 'image/webp',
  'pawnSlug.matthias.shotgun': 'image/webp',
  'pawnSlug.matthias.panzerfaust': 'image/webp',
  'pawnSlug.matthias.motion': 'image/webp',
});

const SHA256_RE = /^[a-f0-9]{64}$/;

describe('Pawn Slug Matthias immutable R2 asset bank', () => {
  it('keeps every required Matthias object content-addressed from the manifest', () => {
    expect(manifest.baseUrl).toBe('https://assets.chess-studio.shadowops.dpdns.org');
    expect(manifest.version).toBe(1);

    const matthiasIds = Object.keys(manifest.assets)
      .filter((logicalId) => logicalId.startsWith('pawnSlug.matthias.'))
      .sort();
    expect(matthiasIds).toEqual(Object.keys(REQUIRED).sort());

    for (const [logicalId, contentType] of Object.entries(REQUIRED)) {
      const entry = manifest.assets[logicalId];
      const extension = contentType === 'image/png' ? '.png' : '.webp';

      expect(Number.isInteger(entry.bytes) && entry.bytes > 0).toBe(true);
      expect(entry.contentType).toBe(contentType);
      expect(entry.sha256).toMatch(SHA256_RE);
      expect(entry.key.startsWith('pawn-slug/matthias/')).toBe(true);
      expect(entry.key).toContain(`-${entry.sha256.slice(0, 16)}.`);
      expect(entry.key.endsWith(extension)).toBe(true);
      expect(entry.url).toBe(`${manifest.baseUrl}/${entry.key}`);
    }
  });
});

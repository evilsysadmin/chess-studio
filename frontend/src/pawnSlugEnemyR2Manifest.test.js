import { describe, expect, it } from 'vitest';
import manifest from './assets/r2-assets-manifest.json';

const EXPECTED = Object.freeze({
  'pawnSlug.enemy.premiumRaster': Object.freeze({
    bytes: 13224,
    contentType: 'image/webp',
    sha256: '7b62f19661e36c2cafcdf5e2033bffb35d12081ebca84c7ca6d5170c2555a272',
  }),
  'pawnSlug.enemy.actionAtlas': Object.freeze({
    bytes: 373596,
    contentType: 'image/webp',
    sha256: 'cf57e6e6be5a5d4ab16386fbeb218cb88f6dd81bc9989205eb0f19dc8d03c348',
  }),
});

describe('Pawn Slug enemy immutable R2 asset bank', () => {
  it('pins the live authored enemy atlases by hash and content-addressed URL', () => {
    expect(manifest.baseUrl).toBe('https://assets.chess-studio.shadowops.dpdns.org');
    expect(manifest.version).toBe(1);

    for (const [logicalId, expected] of Object.entries(EXPECTED)) {
      const entry = manifest.assets[logicalId];
      expect(entry).toMatchObject(expected);
      expect(entry.key).toContain(`-${expected.sha256.slice(0, 16)}.`);
      expect(entry.url).toBe(`${manifest.baseUrl}/${entry.key}`);
    }
  });
});

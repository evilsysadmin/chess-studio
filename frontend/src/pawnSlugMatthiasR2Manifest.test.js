import { describe, expect, it } from 'vitest';
import manifest from './assets/r2-assets-manifest.json';

const EXPECTED = Object.freeze({
  'pawnSlug.matthias.canonicalMaster': Object.freeze({ bytes: 3119009, contentType: 'image/png', sha256: '9c21264274777d012a2941073f6cbae94df090db0459624e6031207c0a288c5f' }),
  'pawnSlug.matthias.pistol': Object.freeze({ bytes: 130478, contentType: 'image/webp', sha256: '42a01598d26b6dedb7f0bfa70c392c6cbd80df9cea1bea7c7224f9a6d8cf2829' }),
  'pawnSlug.matthias.machinegun': Object.freeze({ bytes: 280618, contentType: 'image/webp', sha256: 'ed37fd69ea1f6ae92e1083f84b6bd884054fed2873d96ad84ff02f0ad2bf9edb' }),
  'pawnSlug.matthias.shotgun': Object.freeze({ bytes: 520794, contentType: 'image/webp', sha256: '5462a87a3aa338f418b2ab64e9d678ab2d08ca15bb1b6d2f787c4f7c795ff2aa' }),
  'pawnSlug.matthias.panzerfaust': Object.freeze({ bytes: 554348, contentType: 'image/webp', sha256: '613be27822aea57cae2b64c1b19f3546df307dd567597d9d61cff1c17c6bac35' }),
  'pawnSlug.matthias.motion': Object.freeze({ bytes: 9334, contentType: 'image/webp', sha256: '85988118befde41238cedc4ba772af38d08789bdcfb1671e874ff6743470c393' }),
});

describe('Pawn Slug Matthias immutable R2 asset bank', () => {
  it('pins every approved object by content hash instead of shipping source blobs in Git', () => {
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

import { gunzipSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import payload from './assets/pawnSlug/pow_squad_v1_glb_gzip.b64?raw';
import { PAWN_SLUG_POW_ART_META } from './pawnSlugPowBlenderArt.js';

function decodedGlb() {
  return gunzipSync(Buffer.from(payload.trim(), 'base64'));
}

function glbJson(buffer) {
  expect(buffer.subarray(0, 4).toString('ascii')).toBe('glTF');
  const jsonLength = buffer.readUInt32LE(12);
  const jsonType = buffer.readUInt32LE(16);
  expect(jsonType).toBe(0x4e4f534a);
  return JSON.parse(buffer.subarray(20, 20 + jsonLength).toString('utf8').trim());
}

describe('Pawn Slug Blender POW art', () => {
  it('ships one compressed real GLB containing every stable POW pose contract', () => {
    const json = glbJson(decodedGlb());
    const names = (json.nodes || []).map((node) => node.name || '');
    expect(PAWN_SLUG_POW_ART_META.glbPoses).toEqual(['bound', 'kneeling', 'caged']);
    for (const pose of PAWN_SLUG_POW_ART_META.glbPoses) {
      expect(names.some((name) => name.startsWith(`${pose}__body__`))).toBe(true);
    }
    expect(names.some((name) => name.startsWith('bound__chains__'))).toBe(true);
    expect(names.some((name) => name.startsWith('caged__cage__'))).toBe(true);
    expect(PAWN_SLUG_POW_ART_META.payloadCompression).toBe('gzip');
  });

  it('keeps the procedural mesh as a safe loading/failure fallback', () => {
    expect(PAWN_SLUG_POW_ART_META.primaryArt).toBe('embedded-glb-gzip');
    expect(PAWN_SLUG_POW_ART_META.runtimeUpgrade).toBe('async-fallback-first');
    expect(PAWN_SLUG_POW_ART_META.fallbackArt).toMatch(/premium-military-arcade-prisoner/);
    expect(PAWN_SLUG_POW_ART_META.sourceOfTruth).toContain('scripts/blender/');
  });
});

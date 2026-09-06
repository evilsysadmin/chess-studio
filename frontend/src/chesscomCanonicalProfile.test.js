import { describe, expect, it } from 'vitest';
import {
  CHESSCOM_CANONICAL_LIGHTS,
  CHESSCOM_CANONICAL_PUDDLES,
  CHESSCOM_CANONICAL_SCENE,
  chesscomCanonicalQualityProfile,
} from './chesscomCanonicalProfile.js';

describe('Chesscom canonical Dust Veil profile', () => {
  it('keeps the full cinematic finish on a capable desktop GPU', () => {
    expect(chesscomCanonicalQualityProfile({
      coarse:false,
      dpr:1.5,
      maxTextureSize:8192,
      webglVersion:2,
    })).toMatchObject({
      tier:'ultra',
      puddles:9,
      cables:3,
      extraLights:3,
      wetness:.90,
    });
  });

  it('backs the decorative scene down on coarse or constrained hardware', () => {
    expect(chesscomCanonicalQualityProfile({
      coarse:true,
      dpr:3,
      maxTextureSize:4096,
      webglVersion:2,
    })).toMatchObject({
      tier:'balanced',
      puddles:4,
      cables:1,
      extraLights:1,
      wetness:.72,
    });
  });

  it('keeps a high-DPR desktop polished without treating it as mobile', () => {
    expect(chesscomCanonicalQualityProfile({
      coarse:false,
      dpr:3,
      maxTextureSize:8192,
      webglVersion:2,
    })).toMatchObject({ tier:'high', puddles:6, cables:2, extraLights:2 });
  });

  it('ships a bounded deterministic set of scene dressing anchors', () => {
    expect(CHESSCOM_CANONICAL_SCENE).toBe('dust-veil-canonical-v1');
    expect(CHESSCOM_CANONICAL_PUDDLES).toHaveLength(9);
    expect(CHESSCOM_CANONICAL_LIGHTS).toHaveLength(3);
    for (const puddle of CHESSCOM_CANONICAL_PUDDLES) {
      expect(Number.isFinite(puddle.x)).toBe(true);
      expect(Number.isFinite(puddle.z)).toBe(true);
      expect(puddle.w).toBeGreaterThan(0);
      expect(puddle.h).toBeGreaterThan(0);
    }
  });
});

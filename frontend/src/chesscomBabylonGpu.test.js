import { describe, expect, it } from 'vitest';
import {
  chesscomGpuQualityProfile,
  chesscomPremiumMissOffset,
  chesscomPremiumRoundPattern,
} from './chesscomBabylonGpu.js';

describe('Chesscom GPU premium quality profile', () => {
  it('keeps expensive GPU polish on capable desktop hardware', () => {
    expect(chesscomGpuQualityProfile({ coarse:false, dpr:1.5, maxTextureSize:8192, webglVersion:2 })).toMatchObject({
      tier:'ultra',
      ssao:true,
      gpuParticles:true,
      msaa:4,
    });
  });

  it('backs off on coarse/mobile or constrained GPUs', () => {
    expect(chesscomGpuQualityProfile({ coarse:true, dpr:3, maxTextureSize:4096, webglVersion:2 })).toMatchObject({
      tier:'balanced',
      ssao:false,
      gpuParticles:false,
      msaa:1,
    });
  });
});

describe('Chesscom premium ballistics', () => {
  it('keeps single shots honest and gives bursts visible stray rounds without losing the registered hit', () => {
    expect(chesscomPremiumRoundPattern(1, true)).toEqual([true]);
    expect(chesscomPremiumRoundPattern(3, true)).toEqual([false, true, true]);
    expect(chesscomPremiumRoundPattern(5, true)).toEqual([false, true, false, true, true]);
  });

  it('renders every round as a miss when the tactical state reports no damage', () => {
    expect(chesscomPremiumRoundPattern(4, false)).toEqual([false, false, false, false]);
  });

  it('uses deterministic non-zero miss offsets so ricochets remain reproducible', () => {
    const a = chesscomPremiumMissOffset('matthias:guard-a', 0);
    const b = chesscomPremiumMissOffset('matthias:guard-a', 0);
    const c = chesscomPremiumMissOffset('matthias:guard-a', 1);
    expect(a).toEqual(b);
    expect(a).not.toEqual(c);
    expect(Math.hypot(a.x, a.z)).toBeGreaterThanOrEqual(.62);
    expect(Math.hypot(a.x, a.z)).toBeLessThanOrEqual(1.2);
  });
});

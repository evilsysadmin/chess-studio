import { describe, expect, it } from 'vitest';
import {
  readWarRoomHardwareHints,
  resolveWarRoomAutoRenderQuality,
  resolveWarRoomRenderQuality,
} from './WarRoomRenderQuality.js';

describe('War Room render quality', () => {
  it('keeps manual quality authoritative', () => {
    for (const tier of ['low', 'medium', 'high', 'ultra']) {
      expect(resolveWarRoomRenderQuality({ preference: tier, softwareRenderer: true })).toBe(tier);
    }
  });

  it('degrades software renderers to low in Auto', () => {
    expect(resolveWarRoomRenderQuality({ preference: 'auto', softwareRenderer: true })).toBe('low');
  });

  it('lets genuinely strong touch hardware reach Ultra', () => {
    expect(resolveWarRoomAutoRenderQuality({
      deviceMemory: 8,
      hardwareConcurrency: 8,
      coarsePointer: true,
      viewportWidth: 430,
      viewportHeight: 932,
      devicePixelRatio: 3,
      maxTextureSize: 16384,
    })).toBe('ultra');
  });

  it('keeps capable mainstream hardware in High without desktop-only assumptions', () => {
    expect(resolveWarRoomAutoRenderQuality({
      deviceMemory: 6,
      hardwareConcurrency: 8,
      coarsePointer: true,
      viewportWidth: 390,
      viewportHeight: 844,
      devicePixelRatio: 3,
      maxTextureSize: 8192,
    })).toBe('high');
  });

  it('backs off on weak hardware', () => {
    expect(resolveWarRoomAutoRenderQuality({
      deviceMemory: 2,
      hardwareConcurrency: 2,
      coarsePointer: true,
      viewportWidth: 390,
      viewportHeight: 844,
      devicePixelRatio: 2,
      maxTextureSize: 4096,
    })).toBe('low');
  });

  it('uses conservative Medium when browser hardware hints are mostly unknown', () => {
    expect(resolveWarRoomAutoRenderQuality({})).toBe('medium');
  });

  it('reads only cheap browser hints and preserves unknown values as null', () => {
    const matchMedia = (query) => ({ matches: query === '(pointer: coarse)' });
    expect(readWarRoomHardwareHints({
      navigatorLike: { deviceMemory: 8, hardwareConcurrency: 8 },
      windowLike: { matchMedia, innerWidth: 430, innerHeight: 932, devicePixelRatio: 3 },
    })).toEqual({
      deviceMemory: 8,
      hardwareConcurrency: 8,
      coarsePointer: true,
      viewportWidth: 430,
      viewportHeight: 932,
      devicePixelRatio: 3,
    });

    expect(readWarRoomHardwareHints({ navigatorLike: {}, windowLike: {} })).toEqual({
      deviceMemory: null,
      hardwareConcurrency: null,
      coarsePointer: false,
      viewportWidth: null,
      viewportHeight: null,
      devicePixelRatio: 1,
    });
  });
});

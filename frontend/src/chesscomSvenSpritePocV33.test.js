import {describe,it,expect} from 'vitest';
import {CHESSCOM_SVEN_SPRITE_POC_V33 as S,chesscomSvenSpriteEnabled as on,chesscomSvenSpriteWidth as width} from './chesscomSvenSpritePocV33.js';
describe('Sven sprite vs 3D A/B contract',()=>{
  it('defaults to the existing 3D model unless the URL explicitly opts in',()=>{
    expect(on()).toBe(false);
    expect(on('?chesscomSven=mesh')).toBe(false);
    expect(on('?chesscomSven=sprite')).toBe(true);
    expect(on('?a=1&chesscomSven=sprite')).toBe(true);
    expect(S.fallback).toBe('character-art-v4');
    expect(S.maxSpritePlanes).toBe(1);
  });
  it('is a single bounded NE pose, never an invented animation atlas',()=>{
    expect(S.asset).toBe('/chesscom/sven-probe-ne.webp');
    expect([S.assetWidth,S.assetHeight]).toEqual([100,141]);
    expect(S.height).toBeGreaterThan(1.4);
    expect(S.height).toBeLessThan(1.85);
    expect(width()).toBeCloseTo(S.height*100/141);
    expect(width()).toBeLessThan(1.25);
    expect(()=>width(0)).toThrow(RangeError);
    expect(()=>width(Infinity)).toThrow(RangeError);
  });
});

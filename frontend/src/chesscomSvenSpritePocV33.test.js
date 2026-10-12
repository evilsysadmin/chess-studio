import {describe,it,expect} from 'vitest';
import {CHESSCOM_SVEN_SPRITE_POC_V33 as S, CHESSCOM_SVEN_V45 as V45,chesscomSvenSpriteEnabled as on,chesscomSvenSpriteConfig as config,chesscomSvenSpriteWidth as width} from './chesscomSvenSpritePocV33.js';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
describe('Sven sprite vs 3D A/B contract',()=>{
  it('defaults to the existing 3D model unless the URL explicitly opts in',()=>{
    expect(on()).toBe(false);
    expect(on('?chesscomSven=mesh')).toBe(false);
    expect(on('?chesscomSven=sprite')).toBe(true);
    expect(on('?a=1&chesscomSven=sprite')).toBe(true);
    expect(S.fallback).toBe('character-art-v4');
    expect(S.maxSpritePlanes).toBe(1);
    expect(on('?chesscomSven=v45')).toBe(true);
    expect(config('?chesscomSven=v45')).toBe(V45);
    expect(config('?chesscomSven=atlas')).toBe(null);
    expect(V45.staticOnly).toBe(true);
    expect(V45.maxSpritePlanes).toBe(1);
    expect(V45.portrait).toBe('/chesscom/sven-v45-portrait.webp');
    expect(width(V45.height,V45)).toBeCloseTo(1.72*179/410);
    expect(width(V45.height,V45)).toBeLessThan(.85);
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
  it('ships only verified V45 crops, not the original candidate sheet or invented directional frames',()=>{
    const artifacts=[
      [V45.asset,'58c7cd696af5adf5c08395bbf8c7b2446209d830a686b0499a9b51782631d5bd'],
      [V45.portrait,'a3fa7fef04cc1c930a79a754924fe6750d4f86e395d539c0dbc50fdea35b85b0'],
    ];
    for(const [url,sha] of artifacts){
      const bytes=readFileSync(new URL('../public'+url,import.meta.url));
      expect(createHash('sha256').update(bytes).digest('hex')).toBe(sha);
      expect(bytes.subarray(0,4).toString('ascii')).toBe('RIFF');
      expect(bytes.subarray(8,12).toString('ascii')).toBe('WEBP');
    }
  });
});

import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { createBoardAlbedoMap, makePremiumTileMaterial } from './Board3DSurfaces.js';

function channelRange(texture) {
  const data = texture.image.data;
  let min = 255;
  let max = 0;
  for (let index = 0; index < data.length; index += 4) {
    min = Math.min(min, data[index], data[index + 1], data[index + 2]);
    max = Math.max(max, data[index], data[index + 1], data[index + 2]);
  }
  return max - min;
}

describe('War Room board hero surface', () => {
  it('uses deterministic meso-scale albedo on desktop', () => {
    const first = createBoardAlbedoMap({ seed: 42, light: false });
    const second = createBoardAlbedoMap({ seed: 42, light: false });
    const limestone = createBoardAlbedoMap({ seed: 42, light: true });

    expect(first.image.width).toBe(48);
    expect(first.colorSpace).toBe(THREE.SRGBColorSpace);
    expect(first.userData.surfaceKind).toBe('board-walnut-albedo');
    expect(limestone.userData.surfaceKind).toBe('board-limestone-albedo');
    expect(Array.from(first.image.data.slice(0, 64))).toEqual(Array.from(second.image.data.slice(0, 64)));
    expect(channelRange(first)).toBeGreaterThan(50);
    expect(channelRange(limestone)).toBeGreaterThan(20);

    first.dispose();
    second.dispose();
    limestone.dispose();
  });

  it('binds albedo only to desktop tiles and preserves the cheap coarse path', () => {
    const dark = makePremiumTileMaterial({ color: 0x50372c, light: false, seed: 9 });
    const light = makePremiumTileMaterial({ color: 0xc2ad91, light: true, seed: 10 });
    const mobile = makePremiumTileMaterial({ color: 0x50372c, light: false, seed: 9, coarsePointer: true });

    expect(dark.map).toBeTruthy();
    expect(light.map).toBeTruthy();
    expect(dark.userData.boardHeroFinish).toBe('visible-albedo-v1');
    expect(light.userData.boardHeroFinish).toBe('visible-albedo-v1');
    expect(dark.bumpScale).toBeGreaterThan(light.bumpScale);
    expect(dark.envMapIntensity).toBeGreaterThan(light.envMapIntensity);
    expect(mobile.map).toBeNull();
    expect(mobile.userData.boardHeroFinish).toBe('lite-flat-v1');

    for (const material of [dark, light, mobile]) {
      material.map?.dispose?.();
      material.roughnessMap?.dispose?.();
      material.dispose();
    }
  });
});
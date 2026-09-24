import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import {
  applyWarRoomQualityTier,
  createWarRoomQualityGovernor,
  warRoomShadowIntervalFactor,
} from './WarRoomQualityGovernor.js';
import { shadowRefreshInterval, shouldRefreshShadowMap } from './WarRoomRenderBudget.js';

const feed = (governor, ms, count) => {
  let last = null;
  for (let i = 0; i < count; i += 1) last = governor.observe(ms) || last;
  return last;
};

describe('WarRoomQualityGovernor', () => {
  it('stays full on a healthy cadence', () => {
    const governor = createWarRoomQualityGovernor();
    expect(feed(governor, 16.7, 600)).toBeNull();
    expect(governor.tier).toBe('full');
  });

  it('tightens full -> reduced -> lite on sustained slow frames, never back', () => {
    const governor = createWarRoomQualityGovernor();
    expect(feed(governor, 40, 135)).toBe('reduced');
    expect(feed(governor, 16, 400)).toBeNull();
    expect(governor.tier).toBe('reduced');
    expect(feed(governor, 60, 112)).toBe('lite');
    expect(feed(governor, 16, 400)).toBeNull();
    expect(governor.tier).toBe('lite');
  });

  it('ignores UI pauses and non-finite samples', () => {
    const governor = createWarRoomQualityGovernor();
    expect(feed(governor, 150, 500)).toBeNull();
    expect(feed(governor, Number.NaN, 500)).toBeNull();
    expect(governor.tier).toBe('full');
  });

  it('tolerates 30 fps on coarse pointers but not 20 fps', () => {
    const coarse = createWarRoomQualityGovernor({ coarsePointer: true });
    expect(feed(coarse, 33, 400)).toBeNull();
    expect(feed(createWarRoomQualityGovernor({ coarsePointer: true }), 55, 200)).toBe('reduced');
  });

  it('sheds sprites, pixel ratio and shadows per tier', () => {
    const scene = new THREE.Scene();
    const sprites = new THREE.Object3D();
    sprites.name = 'war-room-fire-sprites';
    const other = new THREE.Object3D();
    other.name = 'WR_ANCHOR_fireplace_practical-fire-sprites';
    scene.add(sprites, other);
    let ratio = 2;
    const renderer = {
      shadowMap: { enabled: true },
      domElement: { dataset: {} },
      getPixelRatio: () => ratio,
      setPixelRatio: (value) => { ratio = value; },
    };
    applyWarRoomQualityTier(renderer, scene, 'reduced');
    expect(sprites.visible).toBe(false);
    expect(other.visible).toBe(false);
    expect(ratio).toBe(1);
    expect(renderer.shadowMap.enabled).toBe(true);
    applyWarRoomQualityTier(renderer, scene, 'lite');
    expect(ratio).toBe(0.75);
    expect(renderer.shadowMap.enabled).toBe(false);
    expect(scene.userData.warRoomQualityTier).toBe('lite');
    expect(renderer.domElement.dataset.warRoomQualityTier).toBe('lite');
  });

  it('never raises an already lower pixel ratio', () => {
    let ratio = 0.7;
    applyWarRoomQualityTier({ getPixelRatio: () => ratio, setPixelRatio: (v) => { ratio = v; } }, null, 'reduced');
    expect(ratio).toBe(0.7);
  });

  it('stretches the shadow refresh by tier', () => {
    expect(warRoomShadowIntervalFactor('full')).toBe(1);
    expect(shadowRefreshInterval({ factor: warRoomShadowIntervalFactor('lite') })).toBe(360 * 6);
    expect(shouldRefreshShadowMap({ now: 1000, lastShadowAt: 0, factor: 6 })).toBe(false);
    expect(shouldRefreshShadowMap({ now: 3000, lastShadowAt: 0, factor: 6 })).toBe(true);
  });
});

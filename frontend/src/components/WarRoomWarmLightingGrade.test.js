import { describe, expect, it } from 'vitest';
import {
  applyWarRoomAtmosphereGrade,
  applyWarRoomHemisphereGrade,
  applyWarRoomKeyLightGrade,
  applyWarRoomV2RuntimeLightingGrade,
  warRoomLightingCoarsePointer,
  warRoomV2RuntimeLightingProfile,
} from './WarRoom3DMotion.js';

function color(initialHex) {
  let hex = initialHex;
  return {
    getHex: () => hex,
    setHex(nextHex) {
      hex = nextHex;
      return this;
    },
  };
}

function position(x, y, z) {
  return {
    x,
    y,
    z,
    set(nextX, nextY, nextZ) {
      this.x = nextX;
      this.y = nextY;
      this.z = nextZ;
    },
  };
}

describe('War Room canonical warm lighting', () => {
  it('keeps lighting modality independent from the shadow quality tier', () => {
    expect(warRoomLightingCoarsePointer({
      budget: { shadowMapSize: 512 },
      mediaQuery: () => ({ matches: false }),
    })).toBe(false);
    expect(warRoomLightingCoarsePointer({
      budget: { shadowMapSize: 1024 },
      mediaQuery: () => ({ matches: true }),
    })).toBe(true);
    expect(warRoomLightingCoarsePointer({ budget: { shadowMapSize: 512 } })).toBe(true);
    expect(warRoomLightingCoarsePointer({ budget: { shadowMapSize: 1024 } })).toBe(false);
  });

  it('grades the room and vertical board wash to a luminous warm club look', () => {
    const hemisphere = {
      isHemisphereLight: true,
      intensity: 1.35,
      color: color(0xffefd0),
      groundColor: color(0x10192b),
      parent: {},
    };
    const key = {
      isDirectionalLight: true,
      color: color(0xffe1aa),
      position: position(-5.4, 10, 6.6),
      parent: {},
    };
    const scene = {
      children: [hemisphere, key],
      userData: {},
      background: color(0x080a0f),
      fog: { isFogExp2: true, color: color(0x080a0f) },
    };

    expect(applyWarRoomAtmosphereGrade(scene)).toMatchObject({ grade: 'warm-amber-room-v2' });
    expect(applyWarRoomHemisphereGrade(scene)).toBe(hemisphere);
    expect(applyWarRoomKeyLightGrade(scene)).toBe(key);

    expect(scene.background.getHex()).toBe(0x100b08);
    expect(scene.fog.color.getHex()).toBe(0x17100c);
    expect(hemisphere.color.getHex()).toBe(0xffe4c4);
    expect(hemisphere.groundColor.getHex()).toBe(0x1b120d);
    expect(key.color.getHex()).toBe(0xffd8ac);
    expect(hemisphere.intensity).toBe(0.62);
    expect(key.position).toMatchObject({ x: -6.4, y: 12.2, z: 3.2 });
    expect(scene.userData.warRoomLightingGrade).toBe('warm-club-v2');
    expect(scene.userData.warRoomAtmosphereGrade).toBe('warm-amber-room-v2');
  });

  it('applies the darker v2 grade only when the Blender shell is active', () => {
    const hemisphere = { intensity: 0.62 };
    const key = { intensity: 1.72 };
    const warmFill = { intensity: 2.45 };
    const renderer = { toneMappingExposure: 1.16 };
    const scene = {
      userData: { warRoomRenderedVariant: 'v2' },
      background: color(0x100b08),
      fog: { isFogExp2: true, color: color(0x17100c) },
    };

    const profile = applyWarRoomV2RuntimeLightingGrade(scene, renderer, {
      hemisphere,
      key,
      warmFill,
    });

    expect(profile).toEqual(warRoomV2RuntimeLightingProfile());
    expect(renderer.toneMappingExposure).toBe(1.12);
    expect(hemisphere.intensity).toBe(0.76);
    expect(key.intensity).toBe(1.60);
    expect(warmFill.intensity).toBe(2.18);
    expect(scene.background.getHex()).toBe(0x0b0705);
    expect(scene.fog.color.getHex()).toBe(0x120b08);
    expect(scene.userData.warRoomV2LightingGrade).toBe('nocturnal-walnut-v4');
  });

  it('recognizes an already graded key instead of depending on the old source color', () => {
    const key = {
      isDirectionalLight: true,
      color: color(0xffd8ac),
      position: position(-6.4, 12.2, -3.2),
      parent: {},
    };
    const scene = { children: [key], userData: {} };

    expect(applyWarRoomKeyLightGrade(scene)).toBe(key);
    expect(key.color.getHex()).toBe(0xffd8ac);
    expect(key.position.z).toBe(-3.2);
  });
});

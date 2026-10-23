import { describe, expect, it, vi } from 'vitest';
import {
  applyWarRoomAtmosphereGrade,
  applyWarRoomHemisphereGrade,
  applyWarRoomKeyLightGrade,
  applyWarRoomV2RuntimeLightingGrade,
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

  it('avoids redundant hemisphere color-space writes while repairing changed colors', () => {
    const hemisphere = {
      isHemisphereLight: true,
      intensity: 1.35,
      color: color(0xffefd0),
      groundColor: color(0x10192b),
      parent: {},
    };
    const colorWrites = vi.spyOn(hemisphere.color, 'setHex');
    const groundWrites = vi.spyOn(hemisphere.groundColor, 'setHex');
    const scene = { children: [hemisphere], userData: {} };

    for (let frame = 0; frame < 30; frame += 1) {
      expect(applyWarRoomHemisphereGrade(scene)).toBe(hemisphere);
    }
    expect(colorWrites).toHaveBeenCalledTimes(1);
    expect(groundWrites).toHaveBeenCalledTimes(1);
    expect(hemisphere.color.getHex()).toBe(0xffe4c4);
    expect(hemisphere.groundColor.getHex()).toBe(0x1b120d);

    // The GPU light palette must recover after an external mutation, without
    // consulting a stale one-shot cache.
    hemisphere.color.setHex(0xffffff);
    hemisphere.groundColor.setHex(0x000000);
    applyWarRoomHemisphereGrade(scene, { coarsePointer: true });
    expect(colorWrites).toHaveBeenCalledTimes(3);
    expect(groundWrites).toHaveBeenCalledTimes(3);
    expect(hemisphere.color.getHex()).toBe(0xffe4c4);
    expect(hemisphere.groundColor.getHex()).toBe(0x1b120d);
    expect(hemisphere.intensity).toBe(1.35);
    applyWarRoomHemisphereGrade(scene);
    expect(colorWrites).toHaveBeenCalledTimes(3);
    expect(groundWrites).toHaveBeenCalledTimes(3);
    expect(hemisphere.intensity).toBe(0.62);
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
    expect(renderer.toneMappingExposure).toBe(1.03);
    expect(hemisphere.intensity).toBe(0.60);
    expect(key.intensity).toBe(1.48);
    expect(warmFill.intensity).toBe(2.02);
    expect(scene.background.getHex()).toBe(0x070504);
    expect(scene.fog.color.getHex()).toBe(0x0d0907);
    expect(scene.userData.warRoomV2LightingGrade).toBe('nocturnal-walnut-v3');
  });

  it('avoids generic-to-v2 color ping-pong every paint and still restores other variants', () => {
    const scene = {
      userData: { warRoomRenderedVariant: 'v2' },
      background: color(0x100b08),
      fog: { isFogExp2: true, color: color(0x17100c) },
    };
    const backgroundWrite = vi.spyOn(scene.background, 'setHex');
    const fogWrite = vi.spyOn(scene.fog.color, 'setHex');

    for (let i = 0; i < 30; i += 1) {
      applyWarRoomAtmosphereGrade(scene);
      applyWarRoomV2RuntimeLightingGrade(scene, null);
    }
    // One dark-grade install, not 30 generic->dark cycles.
    expect(backgroundWrite).toHaveBeenCalledTimes(1);
    expect(fogWrite).toHaveBeenCalledTimes(1);
    expect(scene.background.getHex()).toBe(0x070504);
    expect(scene.fog.color.getHex()).toBe(0x0d0907);
    expect(scene.userData.warRoomAtmosphereGrade).toBe('warm-amber-room-v2');
    expect(scene.userData.warRoomV2LightingGrade).toBe('nocturnal-walnut-v3');

    // Returning to any non-V2 room must immediately restore its warm palette.
    scene.userData.warRoomRenderedVariant = 'v3';
    applyWarRoomAtmosphereGrade(scene);
    expect(scene.background.getHex()).toBe(0x100b08);
    expect(scene.fog.color.getHex()).toBe(0x17100c);
    expect(backgroundWrite).toHaveBeenCalledTimes(2);
    expect(fogWrite).toHaveBeenCalledTimes(2);
    applyWarRoomAtmosphereGrade(scene);
    expect(backgroundWrite).toHaveBeenCalledTimes(2);
    expect(fogWrite).toHaveBeenCalledTimes(2);

    scene.userData.warRoomRenderedVariant = 'v2';
    applyWarRoomAtmosphereGrade(scene);
    applyWarRoomV2RuntimeLightingGrade(scene, null);
    expect(backgroundWrite).toHaveBeenCalledTimes(3);
    expect(fogWrite).toHaveBeenCalledTimes(3);
    expect(scene.background.getHex()).toBe(0x070504);
    expect(scene.fog.color.getHex()).toBe(0x0d0907);
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

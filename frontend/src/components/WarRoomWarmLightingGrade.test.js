import { describe, expect, it } from 'vitest';
import {
  applyWarRoomAtmosphereGrade,
  applyWarRoomHemisphereGrade,
  applyWarRoomKeyLightGrade,
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

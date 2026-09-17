import { describe, expect, it } from 'vitest';
import {
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
  it('grades the vertical board wash to restrained tungsten warmth', () => {
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
    const scene = { children: [hemisphere, key], userData: {} };

    expect(applyWarRoomHemisphereGrade(scene)).toBe(hemisphere);
    expect(applyWarRoomKeyLightGrade(scene)).toBe(key);

    expect(hemisphere.color.getHex()).toBe(0xffd8b0);
    expect(key.color.getHex()).toBe(0xffc58c);
    expect(hemisphere.intensity).toBe(0.35);
    expect(key.position).toMatchObject({ x: -6.4, y: 12.2, z: 3.2 });
    expect(scene.userData.warRoomLightingGrade).toBe('tungsten-club-v1');
  });

  it('recognizes an already graded key instead of depending on the old source color', () => {
    const key = {
      isDirectionalLight: true,
      color: color(0xffc58c),
      position: position(-6.4, 12.2, -3.2),
      parent: {},
    };
    const scene = { children: [key], userData: {} };

    expect(applyWarRoomKeyLightGrade(scene)).toBe(key);
    expect(key.color.getHex()).toBe(0xffc58c);
    expect(key.position.z).toBe(-3.2);
  });
});

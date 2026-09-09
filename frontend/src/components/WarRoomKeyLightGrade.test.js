import { describe, expect, it } from 'vitest';
import { applyWarRoomKeyLightGrade, warRoomKeyLightPose } from './WarRoom3DMotion.js';

function makePosition(x, y, z) {
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

function makeBoardKey(z) {
  return {
    isDirectionalLight: true,
    color: { getHex: () => 0xffe1aa },
    parent: {},
    position: makePosition(-5.4, 10, z),
  };
}

describe('War Room key-light grade', () => {
  it('moves the white-side key higher and away from the frontal player axis', () => {
    const key = makeBoardKey(6.6);
    const scene = { children: [key], userData: {} };

    expect(warRoomKeyLightPose({ whiteSide: true })).toEqual({ x: -6.4, y: 12.2, z: 3.2 });
    expect(applyWarRoomKeyLightGrade(scene)).toBe(key);
    expect(key.position).toMatchObject({ x: -6.4, y: 12.2, z: 3.2 });
    expect(scene.userData).toMatchObject({
      warRoomKeyLightPose: 'high-side-v1',
      warRoomKeyLightPosition: { x: -6.4, y: 12.2, z: 3.2 },
    });
  });

  it('mirrors the same lighting contract for black orientation', () => {
    const key = makeBoardKey(-6.6);
    const scene = { children: [key], userData: {} };

    expect(warRoomKeyLightPose({ whiteSide: false })).toEqual({ x: -6.4, y: 12.2, z: -3.2 });
    applyWarRoomKeyLightGrade(scene);
    expect(key.position).toMatchObject({ x: -6.4, y: 12.2, z: -3.2 });
  });

  it('leaves unrelated directional lights alone', () => {
    const other = {
      isDirectionalLight: true,
      color: { getHex: () => 0xffffff },
      parent: {},
      position: makePosition(1, 2, 3),
    };
    const scene = { children: [other], userData: {} };

    expect(applyWarRoomKeyLightGrade(scene)).toBeNull();
    expect(other.position).toMatchObject({ x: 1, y: 2, z: 3 });
  });
});
import { describe, expect, it } from 'vitest';
import {
  applyWarRoomWarmFillGrade,
  warRoomWarmFillPose,
} from './WarRoom3DMotion.js';

function position(x, y, z) {
  return {
    x, y, z,
    set(nextX, nextY, nextZ) {
      this.x = nextX;
      this.y = nextY;
      this.z = nextZ;
    },
  };
}

describe('War Room rank separation light', () => {
  it('moves the warm point light into a stronger lateral graze for white orientation', () => {
    const key = {
      isDirectionalLight: true,
      color: { getHex: () => 0xffe1aa },
      position: position(-6.4, 12.2, 3.2),
      parent: {},
    };
    const warm = {
      isPointLight: true,
      color: { getHex: () => 0xffa449 },
      position: position(-4.6, 4.4, -5.8),
      parent: {},
    };
    const scene = { children: [key, warm], userData: {} };

    expect(warRoomWarmFillPose({ whiteSide: true })).toEqual({ x: -5.0, y: 3.6, z: 3.15 });
    expect(applyWarRoomWarmFillGrade(scene)).toBe(warm);
    expect(warm.position).toMatchObject({ x: -5.0, y: 3.6, z: 3.15 });
    expect(scene.userData.warRoomRankSeparation).toBe('lateral-graze-ranks-v3');
  });

  it('mirrors symmetrically when the board is viewed from black', () => {
    const key = {
      isDirectionalLight: true,
      color: { getHex: () => 0xffe1aa },
      position: position(-6.4, 12.2, -3.2),
      parent: {},
    };
    const warm = {
      isPointLight: true,
      color: { getHex: () => 0xffa449 },
      position: position(-4.6, 4.4, 5.8),
      parent: {},
    };
    const scene = { children: [key, warm], userData: {} };

    expect(warRoomWarmFillPose({ whiteSide: false })).toEqual({ x: -5.0, y: 3.6, z: -3.15 });
    applyWarRoomWarmFillGrade(scene);
    expect(warm.position).toMatchObject({ x: -5.0, y: 3.6, z: -3.15 });
  });
});

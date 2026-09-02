import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import {
  WAR_ROOM_NIGHT_WINDOW_VERSION,
  installWarRoomNightWindowDepth,
} from './WarRoomNightWindowDepth.js';

function meshes(group) {
  return group.children.filter((child) => child.isMesh);
}

describe('War Room night window depth', () => {
  it('adds exactly two shadow-free layers behind the existing window details', () => {
    const group = new THREE.Group();
    const wallZ = -7.6;
    const towardBoard = 1;

    expect(installWarRoomNightWindowDepth(group, { wallZ, towardBoard })).toBe(2);
    expect(group.userData.warRoomNightWindowDepth).toBe(WAR_ROOM_NIGHT_WINDOW_VERSION);
    expect(group.userData.warRoomNightWindowMeshCount).toBe(2);
    expect(group.userData.warRoomNightWindowTextureCount).toBe(2);

    const sky = group.getObjectByName('war-room-night-sky-panel');
    const mist = group.getObjectByName('war-room-night-mist-panel');
    expect(sky).toBeTruthy();
    expect(mist).toBeTruthy();
    expect(meshes(group)).toHaveLength(2);
    expect(group.children.some((child) => child.isLight)).toBe(false);

    for (const panel of [sky, mist]) {
      expect(panel.castShadow).toBe(false);
      expect(panel.receiveShadow).toBe(false);
      expect(panel.position.x).toBeCloseTo(4.2, 5);
      // Base blue window is at +0.27 from wall; mullions/moon are >= +0.38.
      const offset = (panel.position.z - wallZ) / towardBoard;
      expect(offset).toBeGreaterThan(0.27);
      expect(offset).toBeLessThan(0.38);
    }

    expect(sky.material.map.userData).toMatchObject({
      warRoomNightWindow: 'sky',
      resolution: [128, 64],
    });
    expect(mist.material.map.userData).toMatchObject({
      warRoomNightWindow: 'mist',
      resolution: [128, 32],
    });
    expect(mist.material.transparent).toBe(true);
    expect(mist.material.depthWrite).toBe(false);
  });

  it('mirrors the exterior correctly when the board orientation flips', () => {
    const group = new THREE.Group();
    const wallZ = 7.6;
    const towardBoard = -1;
    installWarRoomNightWindowDepth(group, { wallZ, towardBoard });

    const sky = group.getObjectByName('war-room-night-sky-panel');
    const mist = group.getObjectByName('war-room-night-mist-panel');
    expect(sky.position.x).toBeCloseTo(-4.2, 5);
    expect(mist.position.x).toBeCloseTo(-4.2, 5);
    expect(sky.rotation.y).toBeCloseTo(Math.PI, 5);
    expect(mist.rotation.y).toBeCloseTo(Math.PI, 5);
    expect(sky.position.z).toBeLessThan(wallZ);
    expect(mist.position.z).toBeLessThan(wallZ);
  });

  it('is idempotent and adds nothing on coarse/mobile rendering', () => {
    const desktop = new THREE.Group();
    expect(installWarRoomNightWindowDepth(desktop, { wallZ: -7.6, towardBoard: 1 })).toBe(2);
    expect(installWarRoomNightWindowDepth(desktop, { wallZ: -7.6, towardBoard: 1 })).toBe(0);
    expect(meshes(desktop)).toHaveLength(2);

    const mobile = new THREE.Group();
    expect(installWarRoomNightWindowDepth(mobile, { wallZ: -7.6, towardBoard: 1, coarsePointer: true })).toBe(0);
    expect(mobile.children).toHaveLength(0);
    expect(mobile.userData.warRoomNightWindowDepth).toBeUndefined();
  });
});

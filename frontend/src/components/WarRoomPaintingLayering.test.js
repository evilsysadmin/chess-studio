import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { addPremiumWarRoomPaintings } from './WarRoomPremiumPaintings.js';

function objectsNamed(root, name) {
  const matches = [];
  root.traverse((object) => {
    if (object.name === name) matches.push(object);
  });
  return matches;
}

function visualDepths(objects, towardBoard) {
  const depths = [];
  const matrix = new THREE.Matrix4();
  for (const object of objects) {
    if (object?.isInstancedMesh) {
      for (let index = 0; index < object.count; index += 1) {
        object.getMatrixAt(index, matrix);
        depths.push(matrix.elements[14] * towardBoard);
      }
    } else {
      depths.push(object.position.z * towardBoard);
    }
  }
  return depths;
}

function dispose(root) {
  root.traverse((object) => {
    object.geometry?.dispose?.();
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    for (const material of materials) {
      if (!material) continue;
      for (const value of Object.values(material)) value?.isTexture && value.dispose?.();
      material.dispose?.();
    }
  });
}

describe('War Room painting layer ordering', () => {
  for (const towardBoard of [1, -1]) {
    it(`keeps both canvases and varnish behind their frames when towardBoard=${towardBoard}`, () => {
      const room = new THREE.Group();
      addPremiumWarRoomPaintings(room, { wallZ: -7.6, towardBoard, coarsePointer: false });

      expect(room.userData.warRoomPaintingLayeringVersion).toBe('frame-over-canvas-v1');
      expect(room.userData.warRoomPaintingLayeringCorrected).toBe(2);

      const frontDepth = (object) => object.position.z * towardBoard;
      for (const index of [0, 1]) {
        const frame = room.getObjectByName(`war-room-premium-painting-${index}`);
        const canvas = frame.getObjectByName('war-room-premium-painting-canvas');
        const varnish = frame.getObjectByName('war-room-painting-varnish');
        const outerBars = objectsNamed(frame, 'war-room-premium-frame-outer-bar');
        const innerBars = objectsNamed(frame, 'war-room-premium-frame-inner-bar');
        const outerDepths = visualDepths(outerBars, towardBoard);
        const innerDepths = visualDepths(innerBars, towardBoard);

        expect(frame.userData.warRoomPaintingLayering).toBe('canvas-behind-frame-v1');
        expect(canvas).toBeTruthy();
        expect(varnish).toBeTruthy();
        expect(outerDepths).toHaveLength(4);
        expect(innerDepths).toHaveLength(4);
        expect(frontDepth(varnish)).toBeGreaterThan(frontDepth(canvas));
        for (const depth of outerDepths) expect(depth).toBeGreaterThan(frontDepth(varnish));
        for (const depth of innerDepths) expect(depth).toBeGreaterThan(Math.max(...outerDepths));
      }

      dispose(room);
    });
  }
});

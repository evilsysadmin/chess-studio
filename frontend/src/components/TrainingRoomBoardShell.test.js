import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { squarePosition } from './Board3DBoardMath.js';
import { fitBoardCamera } from './Board3DScene.js';
import { buildTrainingRoomBoardShell } from './TrainingRoomBoardShell.js';

function buildStudy({ whiteSide, width = 1440, height = 900 }) {
  const scene = new THREE.Scene();
  const boardGroup = new THREE.Group();
  scene.add(boardGroup);
  const shell = buildTrainingRoomBoardShell({ scene, boardGroup, whiteSide });
  const camera = new THREE.PerspectiveCamera(40, width / height, 0.1, 100);
  // Use the actual Training Room camera. A synthetic eye position would miss
  // the ceiling/desk occlusion seen in the black-side Replay screenshot.
  fitBoardCamera(camera, width, height, whiteSide, { profile: 'training-room' });
  scene.updateMatrixWorld(true);
  return { scene, boardGroup, shell, camera };
}

function blockedPlayableSquares({ room, camera }) {
  const raycaster = new THREE.Raycaster();
  const blocked = [];
  for (const file of 'abcdefgh') {
    for (let rank = 1; rank <= 8; rank += 1) {
      const square = `${file}${rank}`;
      const { x, z } = squarePosition(square);
      const target = new THREE.Vector3(x, 0.15, z);
      const vector = target.clone().sub(camera.position);
      const distance = vector.length();
      raycaster.set(camera.position, vector.normalize());
      raycaster.near = 0.01;
      raycaster.far = distance - 0.05;
      // Only shell objects: the physical board and pieces are intentionally
      // excluded. Opaque room surfaces must not stand between eye and tile.
      const hit = raycaster.intersectObject(room, true).find(({ object }) => (
        object.isMesh && object.visible
        && (!object.material?.transparent || object.material.opacity >= 0.9)
      ));
      if (hit) blocked.push(`${square} (${hit.object.name || 'unnamed room mesh'})`);
    }
  }
  return blocked;
}

describe('Training Room · board line of sight', () => {
  for (const { name, width, height } of [
    { name: 'desktop', width: 1440, height: 900 },
    { name: 'portrait mobile', width: 390, height: 844 },
  ]) {
    for (const { color, whiteSide } of [
      { color: 'white', whiteSide: true },
      { color: 'black', whiteSide: false },
    ]) {
      it(`never hides any of the 64 playable squares from ${color} camera on ${name}`, () => {
        const { boardGroup, shell, camera } = buildStudy({ whiteSide, width, height });
        expect(blockedPlayableSquares({ room: shell.room, camera })).toEqual([]);

        // The room adapts to the camera, not the playable board/picking grid.
        expect(boardGroup.rotation.y).toBe(0);
        expect(boardGroup.position.y).toBeCloseTo(0.02);
        expect(boardGroup.position.z).toBe(0);
        expect(shell.table.position.z).toBe(0);
      });
    }
  }

  it('detects the original regression: white-facing furniture under a black-facing camera', () => {
    const { shell } = buildStudy({ whiteSide: true });
    const { camera } = buildStudy({ whiteSide: false });
    const blocked = blockedPlayableSquares({ room: shell.room, camera });
    // If this stops being red, the ray test may have lost its sensitivity.
    expect(blocked.length).toBeGreaterThan(0);
  });
});

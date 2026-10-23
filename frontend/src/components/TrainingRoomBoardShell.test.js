import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { buildTrainingRoomBoardShell } from './TrainingRoomBoardShell.js';

describe('Training Room · black/white camera clearance', () => {
  for (const { color, whiteSide, cameraZSign } of [
    { color: 'white', whiteSide: true, cameraZSign: 1 },
    { color: 'black', whiteSide: false, cameraZSign: -1 },
  ]) {
    it(`keeps the physical study behind the playable board for ${color}`, () => {
      const scene = new THREE.Scene();
      const boardGroup = new THREE.Group();
      scene.add(boardGroup);

      const { room, table } = buildTrainingRoomBoardShell({
        scene,
        boardGroup,
        whiteSide,
      });
      scene.updateMatrixWorld(true);

      const desk = room.getObjectByName('insights-training-room-desk');
      const backWall = room.getObjectByName('training-room-back-wall');
      expect(desk).toBeTruthy();
      expect(backWall).toBeTruthy();

      for (const object of [desk, backWall]) {
        const center = object.getWorldPosition(new THREE.Vector3());
        // The camera views the board from +Z as white, -Z as black.
        // Desk and wall must be on the opposite side, never in front.
        expect(center.z * cameraZSign).toBeLessThan(-4);
      }

      // Rotating the room must not rotate or move the board or its picking tiles.
      expect(boardGroup.rotation.y).toBe(0);
      expect(boardGroup.position.y).toBeCloseTo(0.02);
      expect(table.position.z).toBe(0);
    });
  }
});

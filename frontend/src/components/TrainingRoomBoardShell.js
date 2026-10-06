import * as THREE from 'three';
import {
  buildInsightsTrainingRoomLayer,
  INSIGHTS_TRAINING_ROOM_SCENE_VERSION,
} from './InsightsTrainingRoomShell.js';

export function buildTrainingRoomBoardShell({ scene, boardGroup, coarsePointer = false } = {}) {
  if (!scene || !boardGroup) return null;

  const room = buildInsightsTrainingRoomLayer({ coarsePointer });
  room.position.set(0, -0.72, -5);
  room.name = 'training-room-playable-study';
  scene.add(room);

  const table = new THREE.Group();
  table.name = 'training-room-board-table';

  const top = new THREE.Mesh(
    new THREE.BoxGeometry(10.1, 0.34, 10.1),
    new THREE.MeshPhysicalMaterial({
      color: 0x25140d,
      metalness: 0.05,
      roughness: 0.64,
      clearcoat: 0.26,
      clearcoatRoughness: 0.28,
    }),
  );
  top.position.y = -0.32;
  top.receiveShadow = true;
  table.add(top);

  const brass = new THREE.MeshPhysicalMaterial({
    color: 0xa87c36,
    metalness: 0.72,
    roughness: 0.26,
    clearcoat: 0.62,
    clearcoatRoughness: 0.14,
  });
  for (const [x, z, sx, sz] of [
    [0, 4.62, 9.55, 0.08],
    [0, -4.62, 9.55, 0.08],
    [4.62, 0, 0.08, 9.55],
    [-4.62, 0, 0.08, 9.55],
  ]) {
    const rail = new THREE.Mesh(new THREE.BoxGeometry(sx, 0.08, sz), brass);
    rail.position.set(x, -0.11, z);
    table.add(rail);
  }

  scene.add(table);
  boardGroup.position.y = 0.02;

  return {
    room,
    table,
    sceneVersion: INSIGHTS_TRAINING_ROOM_SCENE_VERSION,
  };
}

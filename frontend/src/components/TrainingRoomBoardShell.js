import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import {
  buildInsightsTrainingRoomLayer,
  INSIGHTS_TRAINING_ROOM_SCENE_VERSION,
} from './InsightsTrainingRoomShell.js';

// Board and picking meshes belong to Board3D; this shell stays entirely BELOW
// and OUTSIDE the playable 8x8 footprint. The refined cabinetry also appears
// on touch devices without adding lights, render loops, or external textures.
export function buildTrainingRoomBoardShell({ scene, boardGroup, coarsePointer = false } = {}) {
  if (!scene || !boardGroup) return null;

  const room = buildInsightsTrainingRoomLayer({ coarsePointer });
  room.position.set(0, -0.72, -5);
  room.name = 'training-room-playable-study';
  scene.add(room);

  const table = new THREE.Group();
  table.name = 'training-room-board-table';
  const walnut = new THREE.MeshPhysicalMaterial({
    color: 0x29180f,
    metalness: 0.04,
    roughness: 0.53,
    clearcoat: 0.34,
    clearcoatRoughness: 0.28,
  });
  const darkWalnut = new THREE.MeshStandardMaterial({
    color: 0x140e0b,
    metalness: 0.02,
    roughness: 0.77,
  });
  const brass = new THREE.MeshPhysicalMaterial({
    color: 0xa87c36,
    metalness: 0.72,
    roughness: 0.30,
    clearcoat: 0.5,
    clearcoatRoughness: 0.18,
  });
  const patinatedBrass = new THREE.MeshStandardMaterial({
    color: 0x594426,
    metalness: 0.52,
    roughness: 0.53,
  });

  // Layered bevels read as actual cabinetmaking from the shallow classroom
  // camera angle; the old sharp-edged 10x10 box looked like a flat UI tile.
  const skirt = new THREE.Mesh(new RoundedBoxGeometry(10.34, 0.17, 10.34, 3, 0.07), darkWalnut);
  skirt.position.y = -0.56;
  skirt.receiveShadow = true;
  skirt.name = 'training-table-shadow-skirt';
  table.add(skirt);

  const top = new THREE.Mesh(new RoundedBoxGeometry(10.1, 0.34, 10.1, 4, 0.09), walnut);
  top.position.y = -0.32;
  top.receiveShadow = true;
  top.name = 'training-table-walnut-top';
  table.add(top);

  // Restrained twin inlays: a warm lit upper bevel over a darker patinated
  // hairline. They trace the actual 3D board edge, not an HTML overlay.
  for (const [offset, width, metal, level] of [
    [4.62, 0.08, brass, -0.11],
    [4.92, 0.035, patinatedBrass, -0.145],
  ]) {
    const span = offset === 4.62 ? 9.55 : 9.85;
    for (const [x, z, sx, sz] of [
      [0, offset, span, width],
      [0, -offset, span, width],
      [offset, 0, width, span],
      [-offset, 0, width, span],
    ]) {
      const rail = new THREE.Mesh(new THREE.BoxGeometry(sx, 0.065, sz), metal);
      rail.position.set(x, level, z);
      rail.name = 'training-table-inlaid-brass';
      table.add(rail);
    }
  }

  // Four modest forged pins catch the key light at the corners. Touch/mobile
  // keeps the bevels and rails but avoids decorative micro-meshes.
  if (!coarsePointer) {
    const pinGeometry = new THREE.CylinderGeometry(0.055, 0.055, 0.022, 10);
    for (const x of [-4.87, 4.87]) {
      for (const z of [-4.87, 4.87]) {
        const pin = new THREE.Mesh(pinGeometry, brass);
        pin.position.set(x, -0.11, z);
        pin.name = 'training-table-forged-corner-pin';
        table.add(pin);
      }
    }
  }

  scene.add(table);
  boardGroup.position.y = 0.02;

  return {
    room,
    table,
    sceneVersion: INSIGHTS_TRAINING_ROOM_SCENE_VERSION,
  };
}

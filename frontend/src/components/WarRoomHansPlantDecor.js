import * as THREE from 'three';

export const WAR_ROOM_HANS_PLANT_VERSION = 'hans-war-room-plant-v1';

export function ensureWarRoomHansPlant(root) {
  if (!root) return null;
  const existing = root.getObjectByName?.('war-room-hans-plant');
  if (existing) return existing;
  const floor = root.getObjectByName?.('war-room-castle-floor-slab');
  if (!floor) return null;

  floor.updateMatrixWorld?.(true);
  const box = new THREE.Box3().setFromObject(floor);
  const group = new THREE.Group();
  group.name = 'war-room-hans-plant';
  group.userData.warRoomDecor = WAR_ROOM_HANS_PLANT_VERSION;

  const potMat = new THREE.MeshPhysicalMaterial({ color: 0x6d3f2b, roughness: 0.82, clearcoat: 0.05 });
  const soilMat = new THREE.MeshPhysicalMaterial({ color: 0x24170f, roughness: 1 });
  const stemMat = new THREE.MeshPhysicalMaterial({ color: 0x315b33, roughness: 0.88 });
  const leafMat = new THREE.MeshPhysicalMaterial({ color: 0x476f42, roughness: 0.84, clearcoat: 0.03 });

  const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.24, 0.48, 16), potMat);
  pot.position.y = -0.02;
  pot.castShadow = true;
  pot.receiveShadow = true;
  group.add(pot);
  const soil = new THREE.Mesh(new THREE.CylinderGeometry(0.265, 0.265, 0.035, 16), soilMat);
  soil.position.y = 0.23;
  group.add(soil);

  for (const [x, z, h, lean] of [[0,0,1.05,0.02],[-0.13,0.04,0.86,-0.18],[0.14,-0.02,0.91,0.17]]) {
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.026, h, 7), stemMat);
    stem.position.set(x, 0.25 + h / 2, z);
    stem.rotation.z = lean;
    stem.castShadow = true;
    group.add(stem);
    for (const side of [-1, 1]) {
      const leaf = new THREE.Mesh(new THREE.SphereGeometry(0.19, 10, 7), leafMat);
      leaf.scale.set(1.65, 0.38, 0.72);
      leaf.position.set(x + side * 0.16, 0.48 + h * (side > 0 ? 0.52 : 0.72), z + side * 0.04);
      leaf.rotation.z = side * 0.48 + lean;
      leaf.castShadow = true;
      group.add(leaf);
    }
  }

  const x = box.max.x - Math.min(1.45, (box.max.x - box.min.x) * 0.09);
  const z = box.min.z + (box.max.z - box.min.z) * 0.38;
  group.position.set(x, -0.255, z);
  root.add(group);
  return group;
}

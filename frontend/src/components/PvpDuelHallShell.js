import * as THREE from 'three';
import { createWarRoomBlenderVariantShell } from './WarRoomBlenderShellRuntime.js';
import { PVP_DUEL_HALL_RUNTIME_MODEL_URL } from './PvpDuelHallAsset.js';

export { PVP_DUEL_HALL_R2_ASSET_ID, PVP_DUEL_HALL_RUNTIME_MODEL_URL } from './PvpDuelHallAsset.js';

export function installPvpDuelHallPracticalLights(root, { coarsePointer = false } = {}) {
  const specs = [
    ['PVP_HALL_ANCHOR_identity', 0xffa05a, coarsePointer ? 0.85 : 1.15, 7.5],
    ['PVP_HALL_ANCHOR_roster', 0xffb06a, coarsePointer ? 0.72 : 0.98, 7.0],
    ['PVP_HALL_ANCHOR_herald', 0xff8c3f, coarsePointer ? 0.68 : 0.92, 6.2],
    ['PVP_HALL_ANCHOR_chat', 0xff9a4f, coarsePointer ? 0.78 : 1.04, 7.0],
    ['PVP_HALL_moon', 0x7397d8, coarsePointer ? 0.62 : 0.88, 9.5],
  ];
  const lights = [];

  for (const [anchorName, color, intensity, distance] of specs) {
    const anchor = root?.getObjectByName?.(anchorName);
    if (!anchor) continue;
    const light = new THREE.PointLight(color, intensity, distance, 2);
    light.name = `pvp-duel-hall-practical-${anchorName}`;
    light.castShadow = false;
    light.userData.pvpDuelHallPractical = anchorName;
    anchor.add(light);
    lights.push(light);
  }

  if (root?.userData) root.userData.pvpDuelHallPracticalLights = lights.length;
  return () => {
    lights.forEach((light) => light.removeFromParent());
    if (root?.userData) root.userData.pvpDuelHallPracticalLights = 0;
  };
}

const PVP_DUEL_HALL = createWarRoomBlenderVariantShell({
  variant: 'duel-hall',
  runtimeModelUrl: PVP_DUEL_HALL_RUNTIME_MODEL_URL,
  rootName: 'pvp-duel-hall-gothic-shell',
  runtimeFinish: 'gltf-pbr-pvp-gothic-lobby-v1',
  boardAnchorY: 0,
  cacheBustBuild: false,
  installRuntimeEffects: installPvpDuelHallPracticalLights,
});

export function installPvpDuelHallShell(scene, options = {}) {
  return PVP_DUEL_HALL.install(scene, options);
}

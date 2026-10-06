import * as THREE from 'three';
import { createWarRoomBlenderVariantShell } from './WarRoomBlenderShellRuntime.js';
import { COMBAT_OPERATIONS_ROOM_RUNTIME_MODEL_URL } from './CombatOperationsRoomAsset.js';

export {
  COMBAT_OPERATIONS_ROOM_R2_ASSET_ID,
  COMBAT_OPERATIONS_ROOM_RUNTIME_MODEL_URL,
} from './CombatOperationsRoomAsset.js';

export function installCombatOperationsRoomPracticalLights(root, { coarsePointer = false } = {}) {
  const specs = [
    ['COMBAT_ANCHOR_board_fill', 0xf1c27a, coarsePointer ? 0.66 : 0.62, 9.2],
    ['COMBAT_ANCHOR_map_fill', 0xff9b45, coarsePointer ? 1.22 : 1.12, 7.6],
    ['COMBAT_ANCHOR_barracks_fill', 0xff7f2d, coarsePointer ? 1.18 : 1.08, 6.8],
    ['COMBAT_ANCHOR_memorial_fill', 0xff8b38, coarsePointer ? 1.02 : 0.92, 6.4],
    ['COMBAT_ANCHOR_quartermaster', 0xffa04a, coarsePointer ? 0.80 : 0.72, 5.8],
  ];
  const lights = [];

  for (const [anchorName, color, intensity, distance] of specs) {
    const anchor = root?.getObjectByName?.(anchorName);
    if (!anchor) continue;
    const light = new THREE.PointLight(color, intensity, distance, 2);
    light.name = `combat-operations-practical-${anchorName}`;
    light.castShadow = false;
    light.userData.combatOperationsPractical = anchorName;
    anchor.add(light);
    lights.push(light);
  }

  if (root?.userData) root.userData.combatOperationsPracticalLights = lights.length;
  return () => {
    lights.forEach((light) => light.removeFromParent());
    if (root?.userData) root.userData.combatOperationsPracticalLights = 0;
  };
}

const COMBAT_OPERATIONS_ROOM = createWarRoomBlenderVariantShell({
  variant: 'combat-ops',
  runtimeModelUrl: COMBAT_OPERATIONS_ROOM_RUNTIME_MODEL_URL,
  rootName: 'combat-operations-room-shell',
  runtimeFinish: 'gltf-pbr-combat-operations-v1',
  cacheBustBuild: false,
  installRuntimeEffects: installCombatOperationsRoomPracticalLights,
});

export const combatOperationsRoomModelUrl = COMBAT_OPERATIONS_ROOM.modelUrl;
export const installCombatOperationsRoomShell = COMBAT_OPERATIONS_ROOM.install;

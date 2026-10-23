import * as THREE from 'three';

// Combat's non-playable Operations Room uses its own ivory/iron value split.
// This adjusts only materials already allocated for each actual chess piece:
// no textures, geometry, overlays, emissive cheat or extra GPU resources.
export const COMBAT_OPERATIONS_PIECE_FINISH = 'combat-ops-veteran-satin-v1';

export function applyCombatOperationsPieceFinish(main, side) {
  if (!main?.isMeshPhysicalMaterial || !main.color || !['w', 'b'].includes(side)) return main;
  if (side === 'w') {
    // Lift ivory off the limestone squares, keeping a matte, carved body.
    main.color.lerp(new THREE.Color(0xf0ddbe), 0.44);
    main.roughness = Math.max(main.roughness, 0.73);
    main.clearcoat = Math.min(main.clearcoat, 0.23);
    main.specularIntensity = Math.min(main.specularIntensity, 0.36);
  } else {
    // Charcoal iron rather than featureless black against the dark oak table.
    main.color.lerp(new THREE.Color(0x596476), 0.38);
    main.roughness = Math.max(main.roughness, 0.47);
    main.clearcoat = Math.min(main.clearcoat, 0.58);
    main.envMapIntensity = Math.min(main.envMapIntensity, 0.72);
  }
  main.userData.combatOperationsPieceFinish = COMBAT_OPERATIONS_PIECE_FINISH;
  return main;
}

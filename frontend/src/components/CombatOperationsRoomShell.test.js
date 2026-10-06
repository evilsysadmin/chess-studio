import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import {
  isClassicWarRoomVariant,
  normalizeWarRoomVariant,
  WAR_ROOM_VARIANTS,
  warRoomVariantDefinition,
} from './WarRoomVariant.js';
import {
  COMBAT_OPERATIONS_ROOM_R2_ASSET_ID,
  COMBAT_OPERATIONS_ROOM_RUNTIME_MODEL_URL,
  combatOperationsRoomModelUrl,
  installCombatOperationsRoomPracticalLights,
} from './CombatOperationsRoomShell.js';

describe('Combat Operations Room runtime variant', () => {
  it('owns a dedicated internal Blender variant without entering the player War Room selector', () => {
    expect(COMBAT_OPERATIONS_ROOM_R2_ASSET_ID).toBe('combat.operationsRoom.runtime');
    expect(COMBAT_OPERATIONS_ROOM_RUNTIME_MODEL_URL)
      .toBe('https://assets.chess-studio.shadowops.dpdns.org/combat/operations-room/runtime/current.glb');
    expect(combatOperationsRoomModelUrl({ buildSha: 'abc123' }))
      .toBe(COMBAT_OPERATIONS_ROOM_RUNTIME_MODEL_URL);
    expect(WAR_ROOM_VARIANTS.map(({ id }) => id)).not.toContain('combat-ops');
    expect(normalizeWarRoomVariant('combat-ops')).toBe('combat-ops');
    expect(warRoomVariantDefinition('combat-ops')).toMatchObject({
      id: 'combat-ops',
      shell: 'blender',
      internal: true,
      runtimeModelUrl: COMBAT_OPERATIONS_ROOM_RUNTIME_MODEL_URL,
    });
    expect(isClassicWarRoomVariant({ selectable: false, variant: 'combat-ops' })).toBe(false);
  });

  it('installs restrained authored practicals for the campaign stations', () => {
    const root = new THREE.Group();
    root.userData = {};
    for (const name of [
      'COMBAT_ANCHOR_board_fill',
      'COMBAT_ANCHOR_map_fill',
      'COMBAT_ANCHOR_barracks_fill',
      'COMBAT_ANCHOR_memorial_fill',
      'COMBAT_ANCHOR_quartermaster',
    ]) {
      const anchor = new THREE.Object3D();
      anchor.name = name;
      root.add(anchor);
    }

    const dispose = installCombatOperationsRoomPracticalLights(root, { coarsePointer: false });
    expect(root.userData.combatOperationsPracticalLights).toBe(5);
    expect(root.getObjectByName('COMBAT_ANCHOR_map_fill').children[0].intensity).toBeCloseTo(1.12);
    expect(root.getObjectByName('COMBAT_ANCHOR_barracks_fill').children[0].intensity).toBeCloseTo(1.08);
    expect(root.getObjectByName('COMBAT_ANCHOR_memorial_fill').children[0].intensity).toBeCloseTo(0.92);

    dispose();
    expect(root.userData.combatOperationsPracticalLights).toBe(0);
    expect(root.getObjectByName('COMBAT_ANCHOR_map_fill').children).toHaveLength(0);
  });

  it('does not darken the Operations Room on coarse-pointer/mobile devices', () => {
    const root = new THREE.Group();
    root.userData = {};
    for (const name of [
      'COMBAT_ANCHOR_board_fill',
      'COMBAT_ANCHOR_map_fill',
      'COMBAT_ANCHOR_barracks_fill',
      'COMBAT_ANCHOR_memorial_fill',
      'COMBAT_ANCHOR_quartermaster',
    ]) {
      const anchor = new THREE.Object3D();
      anchor.name = name;
      root.add(anchor);
    }

    const dispose = installCombatOperationsRoomPracticalLights(root, { coarsePointer: true });
    expect(root.getObjectByName('COMBAT_ANCHOR_board_fill').children[0].intensity).toBeGreaterThanOrEqual(0.62);
    expect(root.getObjectByName('COMBAT_ANCHOR_map_fill').children[0].intensity).toBeGreaterThanOrEqual(1.12);
    expect(root.getObjectByName('COMBAT_ANCHOR_barracks_fill').children[0].intensity).toBeGreaterThanOrEqual(1.08);
    expect(root.getObjectByName('COMBAT_ANCHOR_memorial_fill').children[0].intensity).toBeGreaterThanOrEqual(0.92);
    dispose();
  });
});

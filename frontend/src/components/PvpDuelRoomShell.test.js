import { describe, expect, it } from 'vitest';
import {
  normalizeWarRoomVariant,
  WAR_ROOM_VARIANTS,
  warRoomVariantDefinition,
} from './WarRoomVariant.js';
import * as THREE from 'three';
import {
  installPvpDuelRoomPracticalLights,
  PVP_DUEL_ROOM_RUNTIME_MODEL_URL,
  pvpDuelRoomModelUrl,
} from './PvpDuelRoomShell.js';

describe('PvP Duel Room runtime variant', () => {
  it('uses its isolated stable runtime alias', () => {
    expect(PVP_DUEL_ROOM_RUNTIME_MODEL_URL).toBe(
      'https://assets.chess-studio.shadowops.dpdns.org/pvp/duel-room/runtime/current.glb',
    );
    expect(pvpDuelRoomModelUrl({ buildSha: 'abc123' })).toBe(
      PVP_DUEL_ROOM_RUNTIME_MODEL_URL + '?build=abc123',
    );
  });

  it('installs restrained dungeon practicals from authored anchors', () => {
    const root = new THREE.Group();
    root.userData = {};
    for (const name of [
      'PVP_ANCHOR_brazier_left',
      'PVP_ANCHOR_brazier_right',
      'PVP_ANCHOR_moon_fill',
    ]) {
      const anchor = new THREE.Object3D();
      anchor.name = name;
      root.add(anchor);
    }

    const dispose = installPvpDuelRoomPracticalLights(root, { coarsePointer: false });
    expect(root.userData.pvpDuelRoomPracticalLights).toBe(3);
    expect(root.getObjectByName('PVP_ANCHOR_brazier_left').children).toHaveLength(1);
    expect(root.getObjectByName('PVP_ANCHOR_moon_fill').children[0].intensity).toBeCloseTo(1.72);

    dispose();
    expect(root.userData.pvpDuelRoomPracticalLights).toBe(0);
    expect(root.getObjectByName('PVP_ANCHOR_brazier_left').children).toHaveLength(0);
  });

  it('is addressable internally but never enters the normal War Room selector', () => {
    expect(WAR_ROOM_VARIANTS.map(({ id }) => id)).not.toContain('duel');
    expect(normalizeWarRoomVariant('duel')).toBe('duel');
    expect(warRoomVariantDefinition('duel')).toMatchObject({
      id: 'duel',
      shell: 'blender',
      runtimeModelUrl: PVP_DUEL_ROOM_RUNTIME_MODEL_URL,
    });
  });
});

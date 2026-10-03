import { describe, expect, it } from 'vitest';
import {
  normalizeWarRoomVariant,
  WAR_ROOM_VARIANTS,
  warRoomVariantDefinition,
} from './WarRoomVariant.js';
import * as THREE from 'three';
import { r2AssetEntry } from '../r2Assets.js';
import {
  installPvpDuelRoomPracticalLights,
  PVP_DUEL_ROOM_R2_ASSET_ID,
  PVP_DUEL_ROOM_RUNTIME_MODEL_URL,
  pvpDuelRoomModelUrl,
} from './PvpDuelRoomShell.js';

describe('PvP Duel Room runtime variant', () => {
  it('pins the promoted immutable runtime object instead of the mutable current alias', () => {
    expect(PVP_DUEL_ROOM_R2_ASSET_ID).toBe('pvp.duelRoom.runtime');
    expect(PVP_DUEL_ROOM_RUNTIME_MODEL_URL).toBe(
      'https://assets.chess-studio.shadowops.dpdns.org/pvp/duel-room/runtime/pvp-duel-room-shell-b644b06d0c522690.glb',
    );
    expect(PVP_DUEL_ROOM_RUNTIME_MODEL_URL).not.toContain('/current.glb');
    expect(r2AssetEntry(PVP_DUEL_ROOM_R2_ASSET_ID)).toMatchObject({
      bytes: 8248920,
      contentType: 'model/gltf-binary',
      sha256: 'b644b06d0c522690ff0d4f9c6cb3c16e9642afe30dee8258f68948da6d0b9431',
    });
    expect(pvpDuelRoomModelUrl({ buildSha: 'abc123' })).toBe(PVP_DUEL_ROOM_RUNTIME_MODEL_URL);
    expect(pvpDuelRoomModelUrl({ buildSha: 'def456' })).toBe(PVP_DUEL_ROOM_RUNTIME_MODEL_URL);
  });

  it('installs restrained dungeon practicals from authored anchors', () => {
    const root = new THREE.Group();
    root.userData = {};
    for (const name of [
      'PVP_ANCHOR_brazier_left',
      'PVP_ANCHOR_brazier_right',
      'PVP_ANCHOR_side_brazier_left',
      'PVP_ANCHOR_side_brazier_right',
      'PVP_ANCHOR_moon_fill',
      'PVP_ANCHOR_gate_depth',
    ]) {
      const anchor = new THREE.Object3D();
      anchor.name = name;
      root.add(anchor);
    }

    const dispose = installPvpDuelRoomPracticalLights(root, { coarsePointer: false });
    expect(root.userData.pvpDuelRoomPracticalLights).toBe(6);
    expect(root.getObjectByName('PVP_ANCHOR_brazier_left').children).toHaveLength(1);
    expect(root.getObjectByName('PVP_ANCHOR_side_brazier_left').children[0].intensity).toBeCloseTo(1.32);
    expect(root.getObjectByName('PVP_ANCHOR_moon_fill').children[0].intensity).toBeCloseTo(2.20);
    expect(root.getObjectByName('PVP_ANCHOR_gate_depth').children[0].intensity).toBeCloseTo(0.68);

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

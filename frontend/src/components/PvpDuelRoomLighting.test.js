import { describe, expect, it } from 'vitest';
import * as THREE from 'three';

import { installPvpDuelRoomPracticalLights } from './PvpDuelRoomShell.js';

describe('PvP Duel Room player fill', () => {
  it('adds only a restrained near-side fill when the authored anchor exists', () => {
    const root = new THREE.Group();
    root.userData = {};

    const anchor = new THREE.Object3D();
    anchor.name = 'PVP_ANCHOR_player_fill';
    root.add(anchor);

    const dispose = installPvpDuelRoomPracticalLights(root, { coarsePointer: false });

    expect(root.userData.pvpDuelRoomPracticalLights).toBe(1);
    expect(anchor.children).toHaveLength(1);
    expect(anchor.children[0].intensity).toBeCloseTo(0.34);
    expect(anchor.children[0].distance).toBeCloseTo(8.8);
    expect(anchor.children[0].castShadow).toBe(false);

    dispose();
    expect(root.userData.pvpDuelRoomPracticalLights).toBe(0);
    expect(anchor.children).toHaveLength(0);
  });

  it('reduces the same fill on coarse pointers', () => {
    const root = new THREE.Group();
    root.userData = {};

    const anchor = new THREE.Object3D();
    anchor.name = 'PVP_ANCHOR_player_fill';
    root.add(anchor);

    const dispose = installPvpDuelRoomPracticalLights(root, { coarsePointer: true });
    expect(anchor.children[0].intensity).toBeCloseTo(0.18);
    dispose();
  });
});

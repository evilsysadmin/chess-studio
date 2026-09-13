import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { resetWarRoomHansServiceProps } from './WarRoomHansServiceRoutine.js';

function props() {
  return {
    can: new THREE.Group(),
    tray: new THREE.Group(),
  };
}

describe('Hans service prop baselines', () => {
  it('restores the watering can after the pouring pose', () => {
    const current = props();
    current.can.position.set(3, 4, 5);
    current.can.rotation.set(0.4, -0.3, -0.77);

    resetWarRoomHansServiceProps(current);

    expect(current.can.position.toArray()).toEqual([-0.34, 0.64, 0.16]);
    expect(current.can.rotation.toArray().slice(0, 3)).toEqual([0, 0, 0]);
  });

  it('restores the espresso tray as well so reused props always start canonical', () => {
    const current = props();
    current.tray.position.set(-8, -7, -6);
    current.tray.rotation.set(0.9, 0.8, 0.7);

    resetWarRoomHansServiceProps(current);

    expect(current.tray.position.toArray()).toEqual([0, 0.76, 0.38]);
    expect(current.tray.rotation.toArray().slice(0, 3)).toEqual([0, 0, 0]);
  });
});

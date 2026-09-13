import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import {
  applyWarRoomHansMopCarryPose,
  resetWarRoomHansMopProps,
} from './WarRoomHansMopRoutine.js';

function props() {
  return {
    bucket: new THREE.Group(),
    mop: new THREE.Group(),
  };
}

describe('Hans mop prop baselines', () => {
  it('restores the bucket and mop after a cleaning sweep mutates them', () => {
    const current = props();
    current.bucket.position.set(4, -2, 7);
    current.bucket.rotation.set(0.4, 0.5, 0.6);
    current.mop.position.set(-9, 3, 2);
    current.mop.rotation.set(0.7, 0.8, 0.9);

    resetWarRoomHansMopProps(current);

    expect(current.bucket.position.toArray()).toEqual([0.38, 0, -0.18]);
    expect(current.bucket.rotation.toArray().slice(0, 3)).toEqual([0, 0, 0]);
    expect(current.mop.position.toArray()).toEqual([-0.34, 0, 0.12]);
    expect(current.mop.rotation.toArray().slice(0, 3)).toEqual([0, 0, 0]);
  });

  it('rebuilds the carry pose from the baseline instead of leaking the last sweep', () => {
    const current = props();
    current.bucket.position.set(8, 8, 8);
    current.mop.position.set(8, 8, 8);
    current.mop.rotation.z = 1.2;

    applyWarRoomHansMopCarryPose(current, 0);

    expect(current.bucket.position.toArray()).toEqual([0.38, 0.16, -0.18]);
    expect(current.mop.position.toArray()).toEqual([-0.34, 0, 0.12]);
    expect(current.mop.rotation.x).toBeCloseTo(0.08, 8);
    expect(current.mop.rotation.z).toBeCloseTo(-0.12, 8);
  });
});

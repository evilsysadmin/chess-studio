import { describe, expect, it } from 'vitest';
import {
  applyMatthiasPremiumHomePose,
  createMatthiasPremiumHome3D,
  disposeMatthiasPremiumHome3D,
} from './MatthiasPremiumHome3D.js';
import { applyMatthiasHomePropErgonomics } from './matthiasHomePropErgonomics.js';
import { applyMatthiasStrategyBookletRig } from './matthiasStrategyBookletRig.js';

describe('Matthias booklet visual readability', () => {
  it('mantiene el cuadernillo grande, adelantado y claramente abierto en Home', () => {
    const rig = createMatthiasPremiumHome3D();
    const pose = {
      bodyY: 0,
      bodyYaw: 0,
      headPitch: 0,
      headYaw: 0,
      headRoll: 0,
      gazeX: 0,
      browBias: 0,
      smirk: 0,
      mouthOpen: 0,
      blink: 0,
      reach: .32,
      activityTime: 2.4,
      activityProfile: 'read',
    };

    applyMatthiasPremiumHomePose(rig, pose);
    applyMatthiasHomePropErgonomics(rig, pose);
    const beforeHeadPitch = rig.headPivot.rotation.x;
    applyMatthiasStrategyBookletRig(rig, pose);

    const book = rig.activityRig.book;
    const leftPage = rig.root.getObjectByName('strategy-booklet-left-page');
    const rightPage = rig.root.getObjectByName('strategy-booklet-right-page');

    expect(book.scale.x).toBeGreaterThanOrEqual(1.5);
    expect(book.position.y).toBeGreaterThan(-.25);
    expect(book.position.z).toBeGreaterThan(1);
    expect(Math.abs(leftPage.rotation.y)).toBeGreaterThan(.5);
    expect(Math.abs(rightPage.rotation.y)).toBeGreaterThan(.5);
    expect(rig.headPivot.rotation.x - beforeHeadPitch).toBeGreaterThan(.14);

    disposeMatthiasPremiumHome3D(rig);
  });
});
import { describe, expect, it } from 'vitest';
import {
  applyMatthiasPremiumHomePose,
  createMatthiasPremiumHome3D,
  disposeMatthiasPremiumHome3D,
} from './MatthiasPremiumHome3D.js';
import { applyMatthiasHomePropErgonomics } from './matthiasHomePropErgonomics.js';
import {
  MATTHIAS_HOME_SLEEP_COMPOSITION,
  MATTHIAS_HOME_SLEEP_RIG_VERSION,
} from './matthiasHomeSleepRig.js';

function pose(overrides = {}) {
  return {
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
    reach: 0,
    activityProfile: 'sleep',
    ...overrides,
  };
}

function apply(rig, overrides = {}) {
  const next = pose(overrides);
  applyMatthiasPremiumHomePose(rig, next);
  applyMatthiasHomePropErgonomics(rig, next);
}

describe('Matthias premium Home sleep rig', () => {
  it('mantiene visible al peón canónico y usa sólo una manta baja y oscura', () => {
    const rig = createMatthiasPremiumHome3D();
    apply(rig, { activityTime: 0 });

    expect(rig.activityRig.blanket.visible).toBe(false);
    expect(rig.activityRig.premiumSleep.visible).toBe(true);
    expect(rig.root.userData.activitySleepRigVersion).toBe(MATTHIAS_HOME_SLEEP_RIG_VERSION);
    expect(rig.root.userData.activitySleepComposition).toBe(MATTHIAS_HOME_SLEEP_COMPOSITION);
    expect(rig.root.userData.activitySleepState).toBe('canonical-angry-side-nap');

    const blanket = rig.root.getObjectByName('sleep-blanket-lower');
    const pillow = rig.root.getObjectByName('sleep-pillow-premium');
    expect(blanket).toBeTruthy();
    expect(pillow).toBeTruthy();
    expect(rig.root.getObjectByName('sleep-blanket-underfold')).toBeTruthy();
    expect(rig.root.getObjectByName('sleep-blanket-seam')).toBeTruthy();
    expect(rig.activityRig.premiumSleep.getObjectsByProperty('name', 'sleep-blanket-fold')).toHaveLength(2);

    // Regression: the old burgundy cocoon must never return and the canonical
    // pawn body remains the actual visible character underneath the low blanket.
    expect(rig.root.getObjectByName('sleep-wrap-body')).toBeUndefined();
    expect(rig.root.getObjectByName('sleep-wrap-volume')).toBeUndefined();
    expect(rig.root.getObjectByName('sleep-wrap-side-tuck')).toBeUndefined();
    expect(blanket.position.y).toBeLessThan(-.25);
    expect(blanket.scale.y).toBeLessThan(.90);
    expect(rig.body.visible).not.toBe(false);
    expect(rig.root.getObjectByName('premium-coat-body').visible).not.toBe(false);

    disposeMatthiasPremiumHome3D(rig);
  });

  it('duerme de lado con ojos cerrados pero conserva el ceño cabreado canónico', () => {
    const rig = createMatthiasPremiumHome3D();
    apply(rig, { activityTime: 0 });

    expect(rig.root.rotation.z).toBeLessThan(-.45);
    expect(rig.root.rotation.y).toBeLessThan(-.04);
    expect(rig.headPivot.rotation.x).toBeGreaterThan(.20);
    expect(rig.headPivot.rotation.z).toBeLessThan(-.28);
    expect(rig.headPivot.position.x).toBeGreaterThan(.09);
    expect(rig.leftEye.scale.y).toBeLessThan(.10);
    expect(rig.rightEye.scale.y).toBeLessThan(.10);

    // The brows stay in the canonical angry V instead of flattening into a
    // peaceful nap expression.
    expect(Math.abs(rig.leftBrow.rotation.z - Math.PI / 2)).toBeGreaterThan(.35);
    expect(Math.abs(rig.rightBrow.rotation.z - Math.PI / 2)).toBeGreaterThan(.35);
    expect(rig.mouthGroup.scale.y).toBeGreaterThan(.80);
    expect(rig.mouthGroup.visible).toBe(true);
    expect(rig.speechMouth.visible).toBe(false);
    expect(rig.activityRig.support.visible).toBe(false);
    expect(rig.activityRig.assist.visible).toBe(false);

    disposeMatthiasPremiumHome3D(rig);
  });

  it('respira despacio y sólo tirita de frío de forma breve y ocasional', () => {
    const rig = createMatthiasPremiumHome3D();
    apply(rig, { activityTime: 0 });
    expect(rig.root.userData.activitySleepBreath).toBeCloseTo(0, 6);
    expect(rig.root.userData.activitySleepShiver).toBeCloseTo(0, 6);

    apply(rig, { activityTime: 1.05 });
    expect(rig.root.userData.activitySleepBreath).toBeGreaterThan(.005);
    expect(rig.root.userData.activitySleepBreath).toBeLessThan(.007);
    expect(rig.root.userData.activitySleepShiver).toBeCloseTo(0, 6);

    // Midpoint of the deterministic cold-shiver window.
    apply(rig, { activityTime: 9.76 });
    expect(rig.root.userData.activitySleepShiver).toBeGreaterThan(.80);
    expect(rig.root.userData.activitySleepCold).toBe('occasional');

    apply(rig, { activityTime: 9.76, activityReducedMotion: true });
    expect(rig.root.userData.activitySleepBreath).toBe(0);
    expect(rig.root.userData.activitySleepShiver).toBe(0);

    disposeMatthiasPremiumHome3D(rig);
  });

  it('la pose de sueño es absoluta y al despertar no deja cara ni cabeza desplazadas', () => {
    const rig = createMatthiasPremiumHome3D();
    apply(rig, { activityTime: 0 });
    const firstSleepX = rig.headPivot.position.x;

    // Applying multiple frames must not accumulate the previous += x bug.
    apply(rig, { activityTime: .5 });
    apply(rig, { activityTime: 1.0 });
    expect(rig.headPivot.position.x).toBeCloseTo(firstSleepX, 6);

    const awake = pose({ activityProfile: 'idle', activityTime: 2 });
    applyMatthiasPremiumHomePose(rig, awake);
    applyMatthiasHomePropErgonomics(rig, awake);

    expect(rig.activityRig.premiumSleep.visible).toBe(false);
    expect(rig.root.userData.activitySleepState).toBe('inactive');
    expect(rig.root.userData.activitySleepComposition).toBe('inactive');
    expect(rig.leftEye.scale.y).toBeGreaterThan(1.3);
    expect(rig.rightEye.scale.y).toBeGreaterThan(1.3);
    expect(rig.root.rotation.z).toBe(0);
    expect(rig.headPivot.position.x).toBeCloseTo(0, 6);
    expect(rig.mouthGroup.scale.y).toBeCloseTo(.96, 6);

    disposeMatthiasPremiumHome3D(rig);
  });
});

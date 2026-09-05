import * as THREE from 'three';
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

function box(object) {
  return new THREE.Box3().setFromObject(object);
}

describe('Matthias premium Home sleep rig', () => {
  it('sustituye el pupitre por una siesta reclinada con manta envolvente y almohada visible', () => {
    const rig = createMatthiasPremiumHome3D();
    apply(rig, { activityTime: 0 });

    expect(rig.activityRig.blanket.visible).toBe(false);
    expect(rig.activityRig.premiumSleep.visible).toBe(true);
    expect(rig.root.userData.activitySleepRigVersion).toBe(MATTHIAS_HOME_SLEEP_RIG_VERSION);
    expect(rig.root.userData.activitySleepComposition).toBe(MATTHIAS_HOME_SLEEP_COMPOSITION);
    expect(rig.root.userData.activitySleepState).toBe('reclined');

    const wrap = rig.root.getObjectByName('sleep-wrap-body');
    const volume = rig.root.getObjectByName('sleep-wrap-volume');
    const sideTuck = rig.root.getObjectByName('sleep-wrap-side-tuck');
    const pillow = rig.root.getObjectByName('sleep-pillow-premium');
    expect(wrap).toBeTruthy();
    expect(volume).toBeTruthy();
    expect(sideTuck).toBeTruthy();
    expect(pillow).toBeTruthy();
    expect(rig.root.getObjectByName('sleep-wrap-trim')).toBeTruthy();
    expect(rig.root.getObjectsByProperty('name', 'sleep-wrap-fold')).toHaveLength(3);

    const wrapBox = box(wrap);
    const wrapSize = new THREE.Vector3();
    wrapBox.getSize(wrapSize);
    const faceBox = box(rig.head);
    const faceCenter = new THREE.Vector3();
    faceBox.getCenter(faceCenter);
    expect(wrapSize.x).toBeGreaterThan(.95);
    expect(wrapSize.y).toBeGreaterThan(.55);
    // Extrusion bevel + rotated parent can move the world-space AABB by tiny
    // fractions. Keep a 2 mm tolerance while still forcing the wrap below the
    // face centre instead of allowing the old desk/lectern silhouette back.
    expect(wrapBox.max.y).toBeLessThan(faceCenter.y + .032);
    expect(pillow.position.x).toBeGreaterThan(.40);
    expect(pillow.position.y).toBeGreaterThan(.45);

    disposeMatthiasPremiumHome3D(rig);
  });

  it('reclina cuerpo y cabeza hacia la almohada, relaja cejas y oculta brazos', () => {
    const rig = createMatthiasPremiumHome3D();
    apply(rig, { activityTime: 0 });

    expect(rig.root.rotation.z).toBeLessThan(-.20);
    expect(rig.root.rotation.y).toBeLessThan(-.04);
    expect(rig.headPivot.rotation.x).toBeGreaterThan(.20);
    expect(rig.headPivot.rotation.z).toBeLessThan(-.22);
    expect(rig.headPivot.position.x).toBeGreaterThan(.07);
    expect(rig.leftEye.scale.y).toBeLessThan(.12);
    expect(rig.rightEye.scale.y).toBeLessThan(.12);
    expect(Math.abs(rig.leftBrow.rotation.z - Math.PI / 2)).toBeLessThan(.14);
    expect(Math.abs(rig.rightBrow.rotation.z - Math.PI / 2)).toBeLessThan(.14);
    expect(rig.mouthGroup.scale.y).toBeLessThan(.65);
    expect(rig.activityRig.support.visible).toBe(false);
    expect(rig.activityRig.assist.visible).toBe(false);

    disposeMatthiasPremiumHome3D(rig);
  });

  it('respira apenas unos milímetros y reduced-motion congela el movimiento', () => {
    const rig = createMatthiasPremiumHome3D();
    apply(rig, { activityTime: 0 });
    const restingY = rig.activityRig.premiumSleep.position.y;

    apply(rig, { activityTime: .9 });
    const inhaleY = rig.activityRig.premiumSleep.position.y;
    expect(inhaleY - restingY).toBeGreaterThan(.005);
    expect(inhaleY - restingY).toBeLessThan(.012);

    apply(rig, { activityTime: .9, activityReducedMotion: true });
    expect(rig.activityRig.premiumSleep.position.y).toBeCloseTo(-.30, 6);
    expect(rig.root.userData.activitySleepBreath).toBe(0);

    disposeMatthiasPremiumHome3D(rig);
  });

  it('al despertar retira la escena premium y recupera la cara despierta', () => {
    const rig = createMatthiasPremiumHome3D();
    apply(rig, { activityTime: 0 });
    expect(rig.activityRig.premiumSleep.visible).toBe(true);

    const awake = pose({ activityProfile: 'idle', activityTime: 2 });
    applyMatthiasPremiumHomePose(rig, awake);
    applyMatthiasHomePropErgonomics(rig, awake);

    expect(rig.activityRig.premiumSleep.visible).toBe(false);
    expect(rig.root.userData.activitySleepState).toBe('inactive');
    expect(rig.root.userData.activitySleepComposition).toBe('inactive');
    expect(rig.leftEye.scale.y).toBeGreaterThan(1.3);
    expect(rig.rightEye.scale.y).toBeGreaterThan(1.3);
    expect(rig.root.rotation.z).toBe(0);

    disposeMatthiasPremiumHome3D(rig);
  });
});

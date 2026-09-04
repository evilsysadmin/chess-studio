import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import {
  applyMatthiasPremiumHomePose,
  createMatthiasPremiumHome3D,
  disposeMatthiasPremiumHome3D,
  MATTHIAS_PREMIUM_HOME_FACE_RIG_VERSION,
  MATTHIAS_PREMIUM_HOME_FIDELITY_VERSION,
  MATTHIAS_PREMIUM_HOME_MODEL_VERSION,
  MATTHIAS_PREMIUM_HOME_REFERENCE,
  MATTHIAS_PREMIUM_HOME_RENDER_CONTRACT,
} from './MatthiasPremiumHome3D.js';

describe('MatthiasPremiumHome3D', () => {
  it('mantiene la silueta canónica: gorra ancha, cabeza compacta y ojos grandes', () => {
    const rig = createMatthiasPremiumHome3D();
    const capCrown = rig.root.getObjectByName('cap-crown');
    const faceBox = new THREE.Box3().setFromObject(rig.head);
    const capBox = new THREE.Box3().setFromObject(capCrown);
    const faceSize = new THREE.Vector3();
    const capSize = new THREE.Vector3();
    faceBox.getSize(faceSize);
    capBox.getSize(capSize);

    expect(rig.root.name).toBe(MATTHIAS_PREMIUM_HOME_MODEL_VERSION);
    expect(rig.root.userData.faceRigVersion).toBe(MATTHIAS_PREMIUM_HOME_FACE_RIG_VERSION);
    expect(rig.root.userData.fidelityVersion).toBe(MATTHIAS_PREMIUM_HOME_FIDELITY_VERSION);
    expect(rig.root.userData.renderContract).toBe(MATTHIAS_PREMIUM_HOME_RENDER_CONTRACT);
    expect(rig.root.userData.approvedReference).toBe(MATTHIAS_PREMIUM_HOME_REFERENCE);
    expect(capSize.x).toBeGreaterThan(faceSize.x * 1.2);
    expect(rig.leftEye.scale.y).toBeGreaterThan(1.45);
    expect(rig.rightEye.scale.y).toBeGreaterThan(1.45);
    expect(rig.leftEye.scale.x).toBeGreaterThan(.8);
    expect(rig.leftBrow.position.y - rig.leftEye.position.y).toBeLessThan(.19);
    expect(rig.head.material.color.getHex()).toBe(0xe8c990);

    disposeMatthiasPremiumHome3D(rig);
  });

  it('el blink nunca convierte los ojos en rendijas y no introduce zoom ni Z drift', () => {
    const rig = createMatthiasPremiumHome3D();
    applyMatthiasPremiumHomePose(rig, {
      bodyY: .01,
      bodyYaw: .02,
      headPitch: .04,
      headYaw: -.10,
      headRoll: .02,
      gazeX: .02,
      browBias: .01,
      smirk: .2,
      mouthOpen: 0,
      blink: 1,
    });

    expect(rig.leftEye.scale.y).toBeGreaterThan(1.2);
    expect(rig.rightEye.scale.y).toBeGreaterThan(1.2);
    expect(rig.root.position.z).toBe(0);
    expect(rig.root.scale.toArray()).toEqual([1, 1, 1]);

    disposeMatthiasPremiumHome3D(rig);
  });

  it('habla sin convertir la boca en un agujero gigantesco', () => {
    const rig = createMatthiasPremiumHome3D();
    applyMatthiasPremiumHomePose(rig, {
      bodyY: 0,
      bodyYaw: 0,
      headPitch: 0,
      headYaw: 0,
      headRoll: 0,
      gazeX: 0,
      browBias: 0,
      smirk: 0,
      mouthOpen: 1,
      blink: 0,
    });

    expect(rig.speechMouth.visible).toBe(true);
    expect(rig.speechMouth.scale.y).toBeLessThanOrEqual(.5);
    expect(rig.speechMouth.scale.x).toBeLessThanOrEqual(1.3);

    disposeMatthiasPremiumHome3D(rig);
  });
});

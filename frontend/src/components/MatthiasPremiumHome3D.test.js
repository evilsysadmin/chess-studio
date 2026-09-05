import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import {
  applyMatthiasPremiumHomePose,
  createMatthiasPremiumHome3D,
  disposeMatthiasPremiumHome3D,
  matthiasPremiumHomeActivityProp,
  MATTHIAS_PREMIUM_HOME_ACTIVITY_COMPOSITION_VERSION,
  MATTHIAS_PREMIUM_HOME_ACTIVITY_RIG_VERSION,
  MATTHIAS_PREMIUM_HOME_CAP_VERSION,
  MATTHIAS_PREMIUM_HOME_FACE_RIG_VERSION,
  MATTHIAS_PREMIUM_HOME_FIDELITY_VERSION,
  MATTHIAS_PREMIUM_HOME_FRAME_SCALE,
  MATTHIAS_PREMIUM_HOME_FRAME_Y,
  MATTHIAS_PREMIUM_HOME_MODEL_VERSION,
  MATTHIAS_PREMIUM_HOME_REFERENCE,
  MATTHIAS_PREMIUM_HOME_RENDER_CONTRACT,
} from './MatthiasPremiumHome3D.js';

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
    ...overrides,
  };
}

function objectBox(object) {
  return new THREE.Box3().setFromObject(object);
}

function objectSize(object) {
  const size = new THREE.Vector3();
  objectBox(object).getSize(size);
  return size;
}

describe('MatthiasPremiumHome3D', () => {
  it('mantiene la silueta canónica: gorra de plato contenida, cabeza compacta y ojos grandes', () => {
    const rig = createMatthiasPremiumHome3D();
    const capCrown = rig.root.getObjectByName('cap-crown');
    const capTop = rig.root.getObjectByName('cap-top');
    const capBand = rig.root.getObjectByName('cap-red-band');
    const faceBox = new THREE.Box3().setFromObject(rig.head);
    const capBox = new THREE.Box3().setFromObject(capCrown);
    const topBox = new THREE.Box3().setFromObject(capTop);
    const bandBox = new THREE.Box3().setFromObject(capBand);
    const faceSize = new THREE.Vector3();
    const capSize = new THREE.Vector3();
    faceBox.getSize(faceSize);
    capBox.getSize(capSize);

    expect(rig.root.name).toBe(MATTHIAS_PREMIUM_HOME_MODEL_VERSION);
    expect(rig.root.userData.faceRigVersion).toBe(MATTHIAS_PREMIUM_HOME_FACE_RIG_VERSION);
    expect(rig.root.userData.fidelityVersion).toBe(MATTHIAS_PREMIUM_HOME_FIDELITY_VERSION);
    expect(rig.root.userData.renderContract).toBe(MATTHIAS_PREMIUM_HOME_RENDER_CONTRACT);
    expect(rig.root.userData.approvedReference).toBe(MATTHIAS_PREMIUM_HOME_REFERENCE);
    expect(rig.root.userData.capVersion).toBe(MATTHIAS_PREMIUM_HOME_CAP_VERSION);
    expect(rig.root.userData.activityRigVersion).toBe(MATTHIAS_PREMIUM_HOME_ACTIVITY_RIG_VERSION);
    expect(rig.root.userData.activityCompositionVersion).toBe(MATTHIAS_PREMIUM_HOME_ACTIVITY_COMPOSITION_VERSION);
    expect(rig.root.userData.frameScale).toBe(MATTHIAS_PREMIUM_HOME_FRAME_SCALE);
    expect(rig.root.userData.frameY).toBe(MATTHIAS_PREMIUM_HOME_FRAME_Y);
    expect(capSize.x).toBeGreaterThan(faceSize.x * 1.2);
    expect(capSize.x).toBeLessThan(faceSize.x * 1.38);
    expect(capSize.y).toBeGreaterThan(faceSize.y * .16);
    expect(capSize.y).toBeLessThan(faceSize.y * .22);
    expect(capBox.min.y).toBeLessThanOrEqual(bandBox.max.y + .03);
    expect(topBox.min.y).toBeGreaterThan(capBox.max.y - .04);
    expect(rig.leftEye.scale.y).toBeGreaterThan(1.45);
    expect(rig.rightEye.scale.y).toBeGreaterThan(1.45);
    expect(rig.leftEye.scale.x).toBeGreaterThan(.8);
    expect(rig.leftBrow.position.y - rig.leftEye.position.y).toBeLessThan(.19);
    expect(rig.head.material.color.getHex()).toBe(0xe8c990);

    disposeMatthiasPremiumHome3D(rig);
  });

  it('el blink nunca convierte los ojos en rendijas y conserva el safe frame fijo', () => {
    const rig = createMatthiasPremiumHome3D();
    applyMatthiasPremiumHomePose(rig, pose({
      bodyY: .01,
      bodyYaw: .02,
      headPitch: .04,
      headYaw: -.10,
      headRoll: .02,
      gazeX: .02,
      browBias: .01,
      smirk: .2,
      blink: 1,
    }));

    expect(rig.leftEye.scale.y).toBeGreaterThan(1.2);
    expect(rig.rightEye.scale.y).toBeGreaterThan(1.2);
    expect(rig.root.position.y).toBeCloseTo(.01 + MATTHIAS_PREMIUM_HOME_FRAME_Y, 6);
    expect(rig.root.position.z).toBe(0);
    expect(rig.root.scale.toArray()).toEqual([
      MATTHIAS_PREMIUM_HOME_FRAME_SCALE,
      MATTHIAS_PREMIUM_HOME_FRAME_SCALE,
      MATTHIAS_PREMIUM_HOME_FRAME_SCALE,
    ]);
    const framedBox = objectBox(rig.root);
    expect(framedBox.max.y).toBeLessThan(1.24);

    disposeMatthiasPremiumHome3D(rig);
  });

  it('habla sin convertir la boca en un agujero gigantesco', () => {
    const rig = createMatthiasPremiumHome3D();
    applyMatthiasPremiumHomePose(rig, pose({ mouthOpen: 1 }));

    expect(rig.speechMouth.visible).toBe(true);
    expect(rig.speechMouth.scale.y).toBeLessThanOrEqual(.5);
    expect(rig.speechMouth.scale.x).toBeLessThanOrEqual(1.3);

    disposeMatthiasPremiumHome3D(rig);
  });

  it('mapea actividad semántica a utilería 3D sin enseñar props en idle', () => {
    expect(matthiasPremiumHomeActivityProp('sip')).toBe('cup');
    expect(matthiasPremiumHomeActivityProp('breakfast')).toBe('breakfast');
    expect(matthiasPremiumHomeActivityProp('bite')).toBe('ration');
    expect(matthiasPremiumHomeActivityProp('read')).toBe('book');
    expect(matthiasPremiumHomeActivityProp('dossier')).toBe('dossier');
    expect(matthiasPremiumHomeActivityProp('write')).toBe('write');
    expect(matthiasPremiumHomeActivityProp('sleep')).toBe('blanket');

    const rig = createMatthiasPremiumHome3D();
    applyMatthiasPremiumHomePose(rig, pose({ activityProfile: 'idle' }));
    expect(rig.activityRig.root.visible).toBe(true);
    expect(rig.activityRig.cup.visible).toBe(false);
    expect(rig.activityRig.book.visible).toBe(false);
    expect(rig.activityRig.blanket.visible).toBe(false);
    expect(rig.activityRig.support.visible).toBe(false);
    expect(rig.activityRig.assist.visible).toBe(false);
    expect(rig.root.userData.activityProp).toBe('none');

    disposeMatthiasPremiumHome3D(rig);
  });

  it('reach eleva la taza hacia Matthias y cambia de prop sin dejar residuos visibles', () => {
    const rig = createMatthiasPremiumHome3D();
    applyMatthiasPremiumHomePose(rig, pose({ activityProfile: 'sip', reach: .08 }));
    const cupLowY = rig.activityRig.cup.position.y;
    expect(rig.activityRig.cup.visible).toBe(true);
    expect(rig.activityRig.support.visible).toBe(true);
    expect(rig.activityRig.assist.visible).toBe(false);
    expect(rig.root.userData.activityProp).toBe('cup');

    applyMatthiasPremiumHomePose(rig, pose({ activityProfile: 'sip', reach: .54 }));
    expect(rig.activityRig.cup.position.y).toBeGreaterThan(cupLowY + .2);
    expect(rig.root.userData.activityReach).toBeCloseTo(.54, 4);

    applyMatthiasPremiumHomePose(rig, pose({ activityProfile: 'read', headYaw: .08 }));
    expect(rig.activityRig.cup.visible).toBe(false);
    expect(rig.activityRig.book.visible).toBe(true);
    expect(rig.activityRig.assist.visible).toBe(true);
    expect(rig.root.userData.activityProp).toBe('book');

    applyMatthiasPremiumHomePose(rig, pose({ activityProfile: 'write', headYaw: -.04 }));
    expect(rig.activityRig.book.visible).toBe(false);
    expect(rig.activityRig.write.visible).toBe(true);
    expect(rig.activityRig.penPivot).toBeTruthy();
    expect(rig.activityRig.assist.visible).toBe(true);
    expect(rig.root.userData.activityProp).toBe('write');

    disposeMatthiasPremiumHome3D(rig);
  });

  it('desayuno combina taza y plato y sueño se lee como siesta con manta, almohada y ojos cerrados', () => {
    const rig = createMatthiasPremiumHome3D();

    applyMatthiasPremiumHomePose(rig, pose({ activityProfile: 'breakfast', reach: .32 }));
    expect(rig.activityRig.cup.visible).toBe(true);
    expect(rig.activityRig.ration.visible).toBe(true);
    expect(rig.activityRig.support.visible).toBe(true);
    expect(rig.activityRig.assist.visible).toBe(true);
    expect(rig.activityRig.cup.position.x).toBeLessThan(0);
    expect(rig.activityRig.ration.position.x).toBeGreaterThan(0);
    expect(rig.root.userData.activityProp).toBe('breakfast');

    applyMatthiasPremiumHomePose(rig, pose({ activityProfile: 'sleep', headRoll: .05 }));
    expect(rig.activityRig.cup.visible).toBe(false);
    expect(rig.activityRig.ration.visible).toBe(false);
    expect(rig.activityRig.blanket.visible).toBe(true);
    expect(rig.activityRig.support.visible).toBe(false);
    expect(rig.activityRig.assist.visible).toBe(false);
    const blanketBody = rig.root.getObjectByName('sleep-blanket-body');
    expect(blanketBody).toBeTruthy();
    expect(blanketBody.geometry.type).toBe('ExtrudeGeometry');
    expect(rig.root.getObjectByName('sleep-blanket-trim')).toBeTruthy();
    expect(rig.root.getObjectByName('sleep-pillow')).toBeTruthy();
    expect(rig.root.getObjectsByProperty('name', 'sleep-blanket-fold')).toHaveLength(3);
    expect(rig.root.userData.activityProp).toBe('blanket');
    expect(rig.leftEye.scale.y).toBeLessThan(.2);
    expect(rig.rightEye.scale.y).toBeLessThan(.2);
    expect(Math.abs(rig.root.rotation.z)).toBeGreaterThan(.05);
    expect(rig.headPivot.rotation.x).toBeGreaterThan(.1);

    const blanketBodyBox = objectBox(blanketBody);
    const faceBox = objectBox(rig.head);
    expect(blanketBodyBox.max.y).toBeLessThan(faceBox.min.y + .12);

    applyMatthiasPremiumHomePose(rig, pose({ activityProfile: 'idle' }));
    expect(rig.activityRig.blanket.visible).toBe(false);
    expect(rig.leftEye.scale.y).toBeGreaterThan(1.45);
    expect(rig.root.rotation.z).toBe(0);

    disposeMatthiasPremiumHome3D(rig);
  });

  it('compone ración, libro y expediente como objetos legibles sin invadir la cara', () => {
    const rig = createMatthiasPremiumHome3D();

    applyMatthiasPremiumHomePose(rig, pose({ activityProfile: 'bite', reach: .62 }));
    const rationBox = objectBox(rig.activityRig.ration);
    const rationSize = objectSize(rig.activityRig.ration);
    const rationFaceBox = objectBox(rig.head);
    expect(rationSize.x).toBeGreaterThan(.48);
    expect(rationBox.max.x).toBeGreaterThan(.72);
    expect(rationBox.max.y).toBeLessThan(rationFaceBox.min.y + .06);
    expect(rig.root.getObjectByName('ration-plate-rim')).toBeTruthy();
    expect(rig.root.getObjectByName('ration-bread')).toBeTruthy();
    expect(rig.activityRig.assist.visible).toBe(true);

    applyMatthiasPremiumHomePose(rig, pose({ activityProfile: 'read', headYaw: .08 }));
    const bookBox = objectBox(rig.activityRig.book);
    const bookSize = objectSize(rig.activityRig.book);
    const bookFaceBox = objectBox(rig.head);
    expect(bookSize.x).toBeGreaterThan(.50);
    expect(bookBox.max.y).toBeLessThan(bookFaceBox.min.y);
    expect(rig.root.getObjectByName('book-spine').rotation.z).toBeCloseTo(0, 6);

    applyMatthiasPremiumHomePose(rig, pose({ activityProfile: 'dossier', headYaw: -.06 }));
    const dossierBox = objectBox(rig.activityRig.dossier);
    const dossierSize = objectSize(rig.activityRig.dossier);
    const dossierFaceBox = objectBox(rig.head);
    expect(dossierSize.x).toBeGreaterThan(.46);
    expect(dossierBox.max.y).toBeLessThan(dossierFaceBox.min.y);

    applyMatthiasPremiumHomePose(rig, pose({ activityProfile: 'write', headYaw: .05 }));
    const writeBox = objectBox(rig.activityRig.write);
    const writeFaceBox = objectBox(rig.head);
    expect(writeBox.max.y).toBeLessThan(writeFaceBox.min.y);
    expect(rig.root.getObjectByName('activity-pen')).toBeTruthy();

    disposeMatthiasPremiumHome3D(rig);
  });
});

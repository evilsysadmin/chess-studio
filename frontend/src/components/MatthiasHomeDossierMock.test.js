import { describe, expect, it } from 'vitest';
import {
  applyMatthiasPremiumHomePose,
  createMatthiasPremiumHome3D,
  disposeMatthiasPremiumHome3D,
} from './MatthiasPremiumHome3D.js';
import {
  applyMatthiasHomePropErgonomics,
  MATTHIAS_DOSSIER_MOCK_VERSION,
  MATTHIAS_WORK_FOCUS_FACE_VERSION,
} from './matthiasHomePropErgonomics.js';

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
    reach: .25,
    activityProfile: 'dossier',
    ...overrides,
  };
}

describe('Matthias Home dossier approved mock', () => {
  it('copia la composición aprobada y mantiene a Matthias despierto', () => {
    const rig = createMatthiasPremiumHome3D();
    const next = pose();

    applyMatthiasPremiumHomePose(rig, next);
    expect(applyMatthiasHomePropErgonomics(rig, next)).toBe('dossier');

    const mock = rig.root.getObjectByName('activity-dossier-mock');
    expect(mock).toBeTruthy();
    expect(mock.visible).toBe(true);
    expect(mock.userData.rigVersion).toBe(MATTHIAS_DOSSIER_MOCK_VERSION);
    expect(rig.activityRig.dossier.visible).toBe(false);

    expect(mock.getObjectByName('dossier-mock-desk')).toBeTruthy();
    expect(mock.getObjectsByProperty('name', 'dossier-mock-book')).toHaveLength(3);
    expect(mock.getObjectByName('dossier-mock-mug')).toBeTruthy();
    expect(mock.getObjectByName('dossier-mock-page-left')).toBeTruthy();
    expect(mock.getObjectByName('dossier-mock-page-right')).toBeTruthy();
    expect(mock.getObjectsByProperty('name', 'dossier-mock-report-line')).toHaveLength(8);

    expect(rig.leftEye.position.z).toBeGreaterThanOrEqual(.625);
    expect(rig.rightEye.position.z).toBeGreaterThanOrEqual(.625);
    expect(rig.leftEye.scale.y).toBeGreaterThanOrEqual(1.44);
    expect(rig.rightEye.scale.y).toBeGreaterThanOrEqual(1.44);
    expect(rig.root.userData.activityWorkFace).toBe(MATTHIAS_WORK_FOCUS_FACE_VERSION);
    expect(rig.root.userData.activityDossierComposition).toBe(MATTHIAS_DOSSIER_MOCK_VERSION);

    const suspicious = [];
    mock.traverse((object) => {
      if (/knife|blade|cuchillo/i.test(object.name || '')) suspicious.push(object.name);
    });
    expect(suspicious).toEqual([]);

    disposeMatthiasPremiumHome3D(rig);
  });

  it('no contamina el sueño: la siesta sigue siendo el único estado con ojos cerrados', () => {
    const rig = createMatthiasPremiumHome3D();

    const dossier = pose();
    applyMatthiasPremiumHomePose(rig, dossier);
    applyMatthiasHomePropErgonomics(rig, dossier);

    const sleep = pose({ activityProfile: 'sleep', blink: 0, reach: 0 });
    applyMatthiasPremiumHomePose(rig, sleep);
    applyMatthiasHomePropErgonomics(rig, sleep);

    expect(rig.root.getObjectByName('activity-dossier-mock').visible).toBe(false);
    expect(rig.root.userData.activityDossierComposition).toBe('inactive');
    expect(rig.leftEye.scale.y).toBeLessThan(.2);
    expect(rig.rightEye.scale.y).toBeLessThan(.2);

    disposeMatthiasPremiumHome3D(rig);
  });
});

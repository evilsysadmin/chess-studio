import { describe, expect, it } from 'vitest';
import {
  applyMatthiasPremiumHomePose,
  createMatthiasPremiumHome3D,
  disposeMatthiasPremiumHome3D,
} from './MatthiasPremiumHome3D.js';
import {
  applyMatthiasHomePropErgonomics,
  matthiasHomeErgonomicActivityProp,
  MATTHIAS_HOME_PROP_ERGONOMICS_VERSION,
} from './matthiasHomePropErgonomics.js';

function pose(activityProfile, overrides = {}) {
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
    reach: .32,
    activityProfile,
    ...overrides,
  };
}

function apply(rig, activityProfile, overrides = {}) {
  const next = pose(activityProfile, overrides);
  applyMatthiasPremiumHomePose(rig, next);
  return applyMatthiasHomePropErgonomics(rig, next);
}

describe('Matthias Home prop ergonomics', () => {
  it('mantiene cada objeto proporcionado, fuera del pecho y físicamente sujeto', () => {
    const rig = createMatthiasPremiumHome3D();

    expect(MATTHIAS_HOME_PROP_ERGONOMICS_VERSION).toBe('home-props-v1-handheld');

    expect(apply(rig, 'sip', { reach: .45 })).toBe('cup');
    expect(rig.activityRig.cup.scale.x).toBeLessThan(.9);
    expect(rig.activityRig.cup.position.x).toBeGreaterThan(.35);
    expect(rig.activityRig.support.visible).toBe(true);
    expect(rig.activityRig.assist.visible).toBe(false);

    expect(apply(rig, 'beer', { reach: .4 })).toBe('beer');
    expect(rig.activityRig.beer.scale.x).toBeLessThan(.9);
    expect(rig.activityRig.beer.position.x).toBeGreaterThan(.35);
    expect(rig.activityRig.support.visible).toBe(true);
    expect(rig.activityRig.assist.visible).toBe(false);

    expect(apply(rig, 'breakfast')).toBe('breakfast');
    expect(rig.activityRig.breakfast.scale.x).toBeLessThan(.8);
    expect(rig.activityRig.cup.scale.x).toBeLessThan(.75);
    expect(rig.activityRig.breakfast.position.y).toBeLessThan(-.6);
    expect(rig.activityRig.support.visible).toBe(true);
    expect(rig.activityRig.assist.visible).toBe(true);

    expect(apply(rig, 'bite')).toBe('ration');
    expect(rig.activityRig.ration.scale.x).toBeLessThan(.9);
    expect(rig.activityRig.ration.position.y).toBeLessThan(-.58);
    expect(rig.activityRig.ration.position.x).toBeGreaterThan(.15);
    expect(rig.activityRig.support.visible).toBe(true);
    expect(rig.activityRig.assist.visible).toBe(true);

    expect(apply(rig, 'read', { headYaw: .12 })).toBe('book');
    expect(rig.activityRig.book.scale.x).toBeLessThan(.9);
    expect(rig.activityRig.book.position.x).toBeLessThan(0);
    expect(rig.activityRig.book.position.y).toBeLessThan(-.5);
    expect(rig.activityRig.book.rotation.x).toBeLessThan(-.45);
    expect(rig.activityRig.supportGlove.position.x).toBeGreaterThan(rig.activityRig.book.position.x);
    expect(rig.activityRig.assistGlove.position.x).toBeLessThan(rig.activityRig.book.position.x);

    expect(apply(rig, 'dossier', { headYaw: -.08 })).toBe('dossier');
    expect(rig.activityRig.dossier.scale.x).toBeLessThan(.9);
    expect(rig.activityRig.dossier.position.x).toBeGreaterThan(.2);
    expect(rig.activityRig.dossier.position.y).toBeLessThan(-.55);
    expect(Math.abs(rig.activityRig.dossier.rotation.y)).toBeGreaterThan(.25);
    expect(Math.abs(rig.activityRig.dossier.rotation.z)).toBeGreaterThan(.1);
    expect(rig.activityRig.supportGlove.position.x).toBeGreaterThan(rig.activityRig.dossier.position.x);
    expect(rig.activityRig.assistGlove.position.x).toBeLessThan(rig.activityRig.dossier.position.x);

    expect(apply(rig, 'write', { headYaw: .07 })).toBe('write');
    expect(rig.activityRig.write.scale.x).toBeLessThan(.85);
    expect(rig.activityRig.write.position.y).toBeLessThan(-.6);
    expect(rig.activityRig.write.rotation.x).toBeLessThan(-.5);
    expect(rig.activityRig.support.visible).toBe(true);
    expect(rig.activityRig.assist.visible).toBe(true);
    expect(rig.root.getObjectByName('activity-pen')).toBeTruthy();

    expect(apply(rig, 'think', { headYaw: .15 })).toBe('chess');
    expect(rig.activityRig.chess.scale.x).toBeLessThan(.85);
    expect(rig.activityRig.chess.position.y).toBeLessThan(-.68);
    expect(rig.activityRig.support.visible).toBe(true);
    expect(rig.activityRig.assist.visible).toBe(false);

    expect(apply(rig, 'sleep')).toBe('blanket');
    expect(rig.activityRig.support.visible).toBe(false);
    expect(rig.activityRig.assist.visible).toBe(false);
    expect(rig.activityRig.blanket.scale.x).toBe(1);

    expect(rig.root.userData.activityErgonomicsVersion).toBe(MATTHIAS_HOME_PROP_ERGONOMICS_VERSION);
    disposeMatthiasPremiumHome3D(rig);
  });

  it('da a Chess Weekly prensa propia entre dos manos en vez de reciclar el libro', () => {
    const rig = createMatthiasPremiumHome3D();
    expect(matthiasHomeErgonomicActivityProp('press', 'none')).toBe('press');

    expect(apply(rig, 'press', { headYaw: -.10 })).toBe('press');
    expect(rig.activityRig.press).toBeTruthy();
    expect(rig.activityRig.press.visible).toBe(true);
    expect(rig.activityRig.book.visible).toBe(false);
    expect(rig.activityRig.press.scale.x).toBeLessThan(1);
    expect(rig.activityRig.press.position.x).toBeLessThan(0);
    expect(rig.activityRig.press.rotation.x).toBeLessThan(-.4);
    expect(rig.activityRig.support.visible).toBe(true);
    expect(rig.activityRig.assist.visible).toBe(true);
    expect(rig.root.userData.activityProp).toBe('press');

    apply(rig, 'idle');
    expect(rig.activityRig.press.visible).toBe(false);
    disposeMatthiasPremiumHome3D(rig);
  });
});

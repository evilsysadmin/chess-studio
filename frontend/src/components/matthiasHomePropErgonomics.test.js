import { describe, expect, it } from 'vitest';
import {
  applyMatthiasPremiumHomePose,
  createMatthiasPremiumHome3D,
  disposeMatthiasPremiumHome3D,
} from './MatthiasPremiumHome3D.js';
import {
  applyMatthiasHomePropErgonomics,
  matthiasChessWeeklyReadingState,
  matthiasHomeErgonomicActivityProp,
  MATTHIAS_CHESS_WEEKLY_RIG_VERSION,
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

    // The tactical meal now has four internal phases. Inspect the bocata at a
    // deterministic time and require the portrait-readable scale rather than
    // the old miniature-prop contract that caused the canapé effect in Home.
    expect(apply(rig, 'bite', { activityTime: 7 })).toBe('ration');
    expect(rig.root.userData.activityMealPhase).toBe('bocata');
    expect(rig.activityRig.ration.visible).toBe(true);
    expect(rig.activityRig.ration.scale.x).toBeGreaterThanOrEqual(1.18);
    expect(rig.activityRig.ration.position.y).toBeLessThan(-.4);
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

  it('da a Chess Weekly la composición grande y abierta del mock aprobado', () => {
    const rig = createMatthiasPremiumHome3D();
    expect(matthiasHomeErgonomicActivityProp('press', 'none')).toBe('press');

    expect(apply(rig, 'press', { headYaw: -.10, activityTime: 0 })).toBe('press');
    expect(rig.activityRig.press).toBeTruthy();
    expect(rig.activityRig.press.visible).toBe(true);
    expect(rig.activityRig.book.visible).toBe(false);
    expect(rig.activityRig.press.userData.rigVersion).toBe(MATTHIAS_CHESS_WEEKLY_RIG_VERSION);
    expect(MATTHIAS_CHESS_WEEKLY_RIG_VERSION).toBe('chess-weekly-v2-mock-fidelity');
    expect(rig.activityRig.press.scale.x).toBeCloseTo(1.20, 5);
    expect(rig.activityRig.press.position.x).toBeLessThan(0);
    expect(rig.activityRig.press.position.y).toBeGreaterThan(-.34);
    expect(rig.activityRig.press.rotation.x).toBeGreaterThan(-.12);
    expect(Math.abs(rig.root.getObjectByName('chess-weekly-left-page').rotation.y)).toBeGreaterThan(.18);
    expect(Math.abs(rig.root.getObjectByName('chess-weekly-right-page').rotation.y)).toBeGreaterThan(.18);
    expect(rig.activityRig.support.visible).toBe(true);
    expect(rig.activityRig.assist.visible).toBe(true);
    expect(rig.activityRig.supportGlove.position.x).toBeGreaterThan(.44);
    expect(rig.activityRig.assistGlove.position.x).toBeLessThan(-.44);
    expect(rig.root.getObjectByName('chess-weekly-paper-left')).toBeTruthy();
    expect(rig.root.getObjectByName('chess-weekly-paper-right')).toBeTruthy();
    expect(rig.root.getObjectByName('chess-weekly-central-fold')).toBeTruthy();
    expect(rig.root.getObjectsByProperty('name', 'chess-weekly-diagram-dark-square')).toHaveLength(8);
    expect(rig.root.userData.activityProp).toBe('press');
    expect(rig.root.userData.activityPressComposition).toBe('mock-reading-v2');

    // The approved reference reads as focused, not furiously scowling or asleep.
    expect(rig.leftEye.scale.y).toBeGreaterThanOrEqual(1.34);
    expect(rig.rightEye.scale.y).toBeGreaterThanOrEqual(1.34);
    expect(Math.abs(rig.leftBrow.rotation.z - Math.PI / 2)).toBeLessThan(.36);
    expect(Math.abs(rig.rightBrow.rotation.z - Math.PI / 2)).toBeLessThan(.38);

    apply(rig, 'idle');
    expect(rig.activityRig.press.visible).toBe(false);
    expect(rig.root.userData.activityPressComposition).toBe('inactive');
    disposeMatthiasPremiumHome3D(rig);
  });

  it('mueve los ojos por líneas y pasa página de forma espaciada, no como un ventilador de papel', () => {
    const firstLineStart = matthiasChessWeeklyReadingState(.1);
    const firstLineEnd = matthiasChessWeeklyReadingState(1.6);
    const secondLine = matthiasChessWeeklyReadingState(2.1);
    const turning = matthiasChessWeeklyReadingState(4.2);
    const resting = matthiasChessWeeklyReadingState(6.0);
    const speaking = matthiasChessWeeklyReadingState(4.2, { speaking: true });

    expect(firstLineEnd.eyeX).toBeGreaterThan(firstLineStart.eyeX + .02);
    expect(secondLine.readingLine).toBe(1);
    expect(secondLine.eyeY).toBeLessThan(firstLineStart.eyeY);
    expect(turning.pageVisible).toBe(true);
    expect(turning.pageTurn).toBeGreaterThan(.25);
    expect(turning.pageAngle).toBeLessThan(-.8);
    expect(resting.pageVisible).toBe(false);
    expect(resting.pageTurn).toBe(0);
    expect(speaking.pageVisible).toBe(false);
    expect(speaking.eyeX).toBe(0);
    expect(speaking.eyeY).toBe(0);
  });

  it('no hunde los ojos frame a frame mientras lee Chess Weekly', () => {
    const rig = createMatthiasPremiumHome3D();
    const baseLeftY = rig.leftEye.position.y;
    const baseRightY = rig.rightEye.position.y;

    for (let frame = 0; frame < 240; frame += 1) {
      const next = pose('press', {
        headYaw: -.08,
        activityTime: frame / 60,
      });
      applyMatthiasPremiumHomePose(rig, next);
      applyMatthiasHomePropErgonomics(rig, next);
    }

    expect(rig.leftEye.position.y).toBeGreaterThan(baseLeftY - .03);
    expect(rig.rightEye.position.y).toBeGreaterThan(baseRightY - .03);
    expect(rig.leftEye.scale.y).toBeGreaterThanOrEqual(1.34);
    expect(rig.rightEye.scale.y).toBeGreaterThanOrEqual(1.34);

    apply(rig, 'idle');
    expect(rig.leftEye.position.y).toBeCloseTo(baseLeftY, 6);
    expect(rig.rightEye.position.y).toBeCloseTo(baseRightY, 6);
    disposeMatthiasPremiumHome3D(rig);
  });

  it('articula la hoja real y devuelve la mirada al usuario cuando Matthias habla', () => {
    const rig = createMatthiasPremiumHome3D();
    const next = pose('press', { headYaw: -.08, activityTime: 4.2 });
    applyMatthiasPremiumHomePose(rig, next);
    const eyeBefore = rig.leftEye.position.clone();
    const headBefore = rig.headPivot.rotation.clone();
    applyMatthiasHomePropErgonomics(rig, next);

    expect(rig.activityRig.pressPageTurnPivot.visible).toBe(true);
    expect(rig.activityRig.pressPageTurnPivot.rotation.y).toBeLessThan(-.8);
    expect(rig.root.userData.activityPageTurn).toBeGreaterThan(.25);
    expect(rig.leftEye.position.x).not.toBeCloseTo(eyeBefore.x, 4);
    expect(rig.headPivot.rotation.x).toBeGreaterThan(headBefore.x);

    const talking = pose('press', { headYaw: 0, activityTime: 4.2, mouthOpen: .8 });
    applyMatthiasPremiumHomePose(rig, talking);
    const talkingEye = rig.leftEye.position.clone();
    applyMatthiasHomePropErgonomics(rig, talking);
    expect(rig.activityRig.pressPageTurnPivot.visible).toBe(false);
    expect(rig.root.userData.activityPageTurn).toBe(0);
    expect(rig.leftEye.position.x).toBeCloseTo(talkingEye.x, 6);

    disposeMatthiasPremiumHome3D(rig);
  });
});

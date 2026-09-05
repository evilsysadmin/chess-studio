import { describe, expect, it } from 'vitest';
import {
  applyMatthiasPremiumHomePose,
  createMatthiasPremiumHome3D,
  disposeMatthiasPremiumHome3D,
} from './MatthiasPremiumHome3D.js';
import {
  applyMatthiasTacticalMeal,
  clearMatthiasTacticalMeal,
  matthiasTacticalMealState,
  MATTHIAS_TACTICAL_MEAL_RIG_VERSION,
} from './matthiasTacticalMealRig.js';

function bitePose(activityTime, overrides = {}) {
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
    reach: .42,
    activityProfile: 'bite',
    activityTime,
    ...overrides,
  };
}

describe('Matthias tactical meal rig', () => {
  it('rota por hamburguesa, bocata, ración de campaña y cantimplora', () => {
    expect(matthiasTacticalMealState(0).phase).toBe('burger');
    expect(matthiasTacticalMealState(6.1).phase).toBe('bocata');
    expect(matthiasTacticalMealState(12.1).phase).toBe('field-ration');
    expect(matthiasTacticalMealState(18.1).phase).toBe('canteen');
    expect(matthiasTacticalMealState(24.1).phase).toBe('burger');
  });

  it('reduced motion conserva una composición estática y legible', () => {
    const state = matthiasTacticalMealState(19, { reducedMotion: true });
    expect(state.phase).toBe('bocata');
    expect(state.phaseProgress).toBeGreaterThan(0);
  });

  it('usa comida grande de retrato y brazos visibles, no telequinesis', () => {
    const rig = createMatthiasPremiumHome3D();

    let pose = bitePose(.8);
    applyMatthiasPremiumHomePose(rig, pose);
    let state = applyMatthiasTacticalMeal(rig, pose);
    expect(state.phase).toBe('burger');
    expect(MATTHIAS_TACTICAL_MEAL_RIG_VERSION).toBe('tactical-meal-v2-portrait-scale-arms');
    expect(rig.activityRig.tacticalBurger.visible).toBe(true);
    expect(rig.activityRig.ration.visible).toBe(false);
    expect(rig.activityRig.tacticalBurger.scale.x).toBeGreaterThanOrEqual(1.28);
    expect(rig.activityRig.support.visible).toBe(true);
    expect(rig.activityRig.assist.visible).toBe(true);
    expect(rig.activityRig.supportStem.scale.x).toBeGreaterThan(1.35);
    expect(rig.activityRig.assistStem.scale.x).toBeGreaterThan(1.35);
    expect(rig.activityRig.supportStem.position.z).toBeGreaterThan(.58);
    expect(rig.activityRig.assistStem.position.z).toBeGreaterThan(.58);
    expect(rig.activityRig.supportGlove.position.z).toBeGreaterThan(.82);
    expect(rig.activityRig.assistGlove.position.z).toBeGreaterThan(.82);
    expect(rig.root.userData.activityMealArmStyle).toBe('visible-holding-arms-v2');
    expect(rig.root.getObjectByName('tactical-burger-patty')).toBeTruthy();
    expect(rig.root.getObjectByName('tactical-burger-cheese')).toBeTruthy();

    pose = bitePose(7);
    applyMatthiasPremiumHomePose(rig, pose);
    state = applyMatthiasTacticalMeal(rig, pose);
    expect(state.phase).toBe('bocata');
    expect(rig.activityRig.ration.visible).toBe(true);
    expect(rig.activityRig.ration.scale.x).toBeGreaterThanOrEqual(1.18);
    expect(rig.activityRig.tacticalBurger.visible).toBe(false);
    expect(rig.activityRig.support.visible).toBe(true);
    expect(rig.activityRig.assist.visible).toBe(true);

    pose = bitePose(13);
    applyMatthiasPremiumHomePose(rig, pose);
    state = applyMatthiasTacticalMeal(rig, pose);
    expect(state.phase).toBe('field-ration');
    expect(rig.activityRig.tacticalFieldRation.visible).toBe(true);
    expect(rig.activityRig.tacticalFieldRation.scale.x).toBeGreaterThanOrEqual(1.15);
    expect(rig.root.getObjectByName('tactical-ration-mess-tin')).toBeTruthy();
    expect(rig.root.getObjectByName('tactical-ration-pouch')).toBeTruthy();
    expect(rig.root.getObjectByName('tactical-ration-spoon')).toBeTruthy();

    pose = bitePose(19);
    applyMatthiasPremiumHomePose(rig, pose);
    state = applyMatthiasTacticalMeal(rig, pose);
    expect(state.phase).toBe('canteen');
    expect(rig.activityRig.tacticalCanteen.visible).toBe(true);
    expect(rig.activityRig.tacticalCanteen.scale.x).toBeGreaterThanOrEqual(1.16);
    expect(rig.activityRig.support.visible).toBe(true);
    expect(rig.activityRig.assist.visible).toBe(false);
    expect(rig.activityRig.supportStem.position.z).toBeGreaterThan(.58);
    expect(rig.root.getObjectByName('tactical-canteen-body')).toBeTruthy();
    expect(rig.root.getObjectByName('tactical-canteen-strap')).toBeTruthy();
    expect(rig.root.userData.activityMealRigVersion).toBe(MATTHIAS_TACTICAL_MEAL_RIG_VERSION);

    clearMatthiasTacticalMeal(rig);
    expect(rig.activityRig.tacticalBurger.visible).toBe(false);
    expect(rig.activityRig.tacticalFieldRation.visible).toBe(false);
    expect(rig.activityRig.tacticalCanteen.visible).toBe(false);
    expect(rig.activityRig.supportStem.scale.x).toBe(1);
    expect(rig.activityRig.assistStem.scale.x).toBe(1);
    expect(rig.root.userData.activityMealPhase).toBe('inactive');
    expect(rig.root.userData.activityMealArmStyle).toBe('inactive');

    disposeMatthiasPremiumHome3D(rig);
  });
});

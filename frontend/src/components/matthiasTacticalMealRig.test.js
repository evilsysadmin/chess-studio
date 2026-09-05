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

  it('crea utilería premium y la sujeta físicamente según la fase', () => {
    const rig = createMatthiasPremiumHome3D();

    let pose = bitePose(.8);
    applyMatthiasPremiumHomePose(rig, pose);
    let state = applyMatthiasTacticalMeal(rig, pose);
    expect(state.phase).toBe('burger');
    expect(rig.activityRig.tacticalBurger.visible).toBe(true);
    expect(rig.activityRig.ration.visible).toBe(false);
    expect(rig.activityRig.support.visible).toBe(true);
    expect(rig.activityRig.assist.visible).toBe(true);
    expect(rig.root.getObjectByName('tactical-burger-patty')).toBeTruthy();
    expect(rig.root.getObjectByName('tactical-burger-cheese')).toBeTruthy();

    pose = bitePose(7);
    applyMatthiasPremiumHomePose(rig, pose);
    state = applyMatthiasTacticalMeal(rig, pose);
    expect(state.phase).toBe('bocata');
    expect(rig.activityRig.ration.visible).toBe(true);
    expect(rig.activityRig.tacticalBurger.visible).toBe(false);

    pose = bitePose(13);
    applyMatthiasPremiumHomePose(rig, pose);
    state = applyMatthiasTacticalMeal(rig, pose);
    expect(state.phase).toBe('field-ration');
    expect(rig.activityRig.tacticalFieldRation.visible).toBe(true);
    expect(rig.root.getObjectByName('tactical-ration-mess-tin')).toBeTruthy();
    expect(rig.root.getObjectByName('tactical-ration-pouch')).toBeTruthy();
    expect(rig.root.getObjectByName('tactical-ration-spoon')).toBeTruthy();

    pose = bitePose(19);
    applyMatthiasPremiumHomePose(rig, pose);
    state = applyMatthiasTacticalMeal(rig, pose);
    expect(state.phase).toBe('canteen');
    expect(rig.activityRig.tacticalCanteen.visible).toBe(true);
    expect(rig.activityRig.assist.visible).toBe(false);
    expect(rig.root.getObjectByName('tactical-canteen-body')).toBeTruthy();
    expect(rig.root.getObjectByName('tactical-canteen-strap')).toBeTruthy();
    expect(rig.root.userData.activityMealRigVersion).toBe(MATTHIAS_TACTICAL_MEAL_RIG_VERSION);

    clearMatthiasTacticalMeal(rig);
    expect(rig.activityRig.tacticalBurger.visible).toBe(false);
    expect(rig.activityRig.tacticalFieldRation.visible).toBe(false);
    expect(rig.activityRig.tacticalCanteen.visible).toBe(false);
    expect(rig.root.userData.activityMealPhase).toBe('inactive');

    disposeMatthiasPremiumHome3D(rig);
  });
});

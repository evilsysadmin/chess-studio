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
  MATTHIAS_CAMPAIGN_DINNER_COMPOSITION_VERSION,
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

describe('Matthias campaign dinner rig', () => {
  it('mantiene una sola Cena de campaña estable en vez de rotar props', () => {
    expect(matthiasTacticalMealState(0).phase).toBe('campaign-dinner');
    expect(matthiasTacticalMealState(6.1).phase).toBe('campaign-dinner');
    expect(matthiasTacticalMealState(12.1).phase).toBe('campaign-dinner');
    expect(matthiasTacticalMealState(18.1).phase).toBe('campaign-dinner');
    expect(matthiasTacticalMealState(24.1).phase).toBe('campaign-dinner');
  });

  it('reduced motion conserva la misma composición aprobada y legible', () => {
    const state = matthiasTacticalMealState(19, { reducedMotion: true });
    expect(state.phase).toBe('campaign-dinner');
    expect(state.phaseProgress).toBe(.25);
  });

  it('renderiza bandeja militar, taza, pan y rancho con brazos y manos claramente visibles', () => {
    const rig = createMatthiasPremiumHome3D();
    const pose = bitePose(.8);
    applyMatthiasPremiumHomePose(rig, pose);
    const state = applyMatthiasTacticalMeal(rig, pose);

    expect(state.phase).toBe('campaign-dinner');
    expect(MATTHIAS_TACTICAL_MEAL_RIG_VERSION).toBe('tactical-meal-v3-campaign-dinner');
    expect(MATTHIAS_CAMPAIGN_DINNER_COMPOSITION_VERSION).toBe('campaign-dinner-v1-approved-mock');

    expect(rig.activityRig.campaignDinner.visible).toBe(true);
    expect(rig.activityRig.ration.visible).toBe(false);
    expect(rig.root.getObjectByName('campaign-dinner-tray-base')).toBeTruthy();
    expect(rig.root.getObjectByName('campaign-dinner-tray-front-rim')).toBeTruthy();
    expect(rig.root.getObjectByName('campaign-dinner-mug-body')).toBeTruthy();
    expect(rig.root.getObjectByName('campaign-dinner-mug-handle')).toBeTruthy();
    expect(rig.root.getObjectByName('campaign-dinner-bread-slice')).toBeTruthy();
    expect(rig.root.getObjectByName('campaign-dinner-stew')).toBeTruthy();
    expect(rig.root.getObjectByName('campaign-dinner-stew-chunk')).toBeTruthy();
    expect(rig.root.getObjectByName('campaign-dinner-steam')).toBeTruthy();

    expect(rig.activityRig.support.visible).toBe(true);
    expect(rig.activityRig.assist.visible).toBe(true);
    expect(rig.activityRig.supportStem.scale.x).toBeGreaterThanOrEqual(1.7);
    expect(rig.activityRig.assistStem.scale.x).toBeGreaterThanOrEqual(1.7);
    expect(rig.activityRig.supportGlove.scale.x).toBeGreaterThanOrEqual(1.45);
    expect(rig.activityRig.assistGlove.scale.x).toBeGreaterThanOrEqual(1.45);
    expect(rig.activityRig.supportGlove.position.x).toBeGreaterThan(.48);
    expect(rig.activityRig.assistGlove.position.x).toBeLessThan(-.48);
    expect(rig.activityRig.supportGlove.position.z).toBeGreaterThan(.86);
    expect(rig.activityRig.assistGlove.position.z).toBeGreaterThan(.86);
    expect(rig.activityRig.campaignDinnerRightCuff.visible).toBe(true);
    expect(rig.activityRig.campaignDinnerLeftCuff.visible).toBe(true);

    expect(rig.root.userData.activityMealRigVersion).toBe(MATTHIAS_TACTICAL_MEAL_RIG_VERSION);
    expect(rig.root.userData.activityMealComposition).toBe(MATTHIAS_CAMPAIGN_DINNER_COMPOSITION_VERSION);
    expect(rig.root.userData.activityMealArmStyle).toBe('campaign-dinner-open-hands-v3');

    clearMatthiasTacticalMeal(rig);
    expect(rig.activityRig.campaignDinner.visible).toBe(false);
    expect(rig.activityRig.campaignDinnerRightCuff.visible).toBe(false);
    expect(rig.activityRig.campaignDinnerLeftCuff.visible).toBe(false);
    expect(rig.activityRig.supportStem.scale.x).toBe(1);
    expect(rig.activityRig.assistStem.scale.x).toBe(1);
    expect(rig.root.userData.activityMealPhase).toBe('inactive');
    expect(rig.root.userData.activityMealComposition).toBe('inactive');
    expect(rig.root.userData.activityMealArmStyle).toBe('inactive');

    disposeMatthiasPremiumHome3D(rig);
  });
});

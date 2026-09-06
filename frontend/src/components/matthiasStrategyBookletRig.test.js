import { describe, expect, it } from 'vitest';
import {
  applyMatthiasPremiumHomePose,
  createMatthiasPremiumHome3D,
  disposeMatthiasPremiumHome3D,
} from './MatthiasPremiumHome3D.js';
import { applyMatthiasHomePropErgonomics } from './matthiasHomePropErgonomics.js';
import { applyMatthiasHomePropContactRig } from './matthiasHomePropContactRig.js';
import {
  applyMatthiasStrategyBookletRig,
  clearMatthiasStrategyBookletRig,
  matthiasStrategyBookletReadingState,
  MATTHIAS_STRATEGY_BOOKLET_RIG_VERSION,
} from './matthiasStrategyBookletRig.js';

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
    activityTime: 2.4,
    activityProfile,
    ...overrides,
  };
}

function applyBase(rig, activityProfile, overrides = {}) {
  const next = pose(activityProfile, overrides);
  applyMatthiasPremiumHomePose(rig, next);
  applyMatthiasHomePropErgonomics(rig, next);
  return next;
}

describe('Matthias strategy booklet rig', () => {
  it('convierte la estampita en un cuadernillo abierto grande y sujeto con dos manos', () => {
    const rig = createMatthiasPremiumHome3D();

    // First leave a real contact surface alive to prove the booklet clears the
    // previous environmental staging rather than accidentally reading on it.
    applyBase(rig, 'sip', { reach: .42 });
    applyMatthiasHomePropContactRig(rig);
    expect(rig.activityRig.objectInteractionSurface.visible).toBe(true);

    const next = applyBase(rig, 'read', { headYaw: .08, activityTime: 2.4 });
    const headBeforeBooklet = rig.headPivot.rotation.x;
    const result = applyMatthiasStrategyBookletRig(rig, next);

    expect(result?.prop).toBe('book');
    expect(result?.staging).toBe('held-open-booklet');
    expect(result?.supportSolved).toBe(true);
    expect(result?.assistSolved).toBe(true);
    expect(MATTHIAS_STRATEGY_BOOKLET_RIG_VERSION).toBe('strategy-booklet-v1-open-two-hand');
    expect(rig.root.userData.activityStrategyBookletRig).toBe(MATTHIAS_STRATEGY_BOOKLET_RIG_VERSION);
    expect(rig.root.userData.activityObjectStaging).toBe('held-open-booklet');
    expect(rig.root.userData.activityPropRelationship).toBe('handheld-reading');
    expect(rig.root.userData.activityPropContactHands).toBe('booklet:1/1');
    expect(rig.root.userData.activityStrategyBookletHands).toBe('two-hand-corners');

    const book = rig.activityRig.book;
    const leftPage = rig.root.getObjectByName('strategy-booklet-left-page');
    const rightPage = rig.root.getObjectByName('strategy-booklet-right-page');
    const leftPaper = rig.root.getObjectByName('strategy-booklet-paper-left');
    const rightPaper = rig.root.getObjectByName('strategy-booklet-paper-right');

    expect(book.visible).toBe(true);
    // Home is rendered inside a small card. A merely >1 scale technically
    // passed while still looking like a postcard. Lock the real visual floor.
    expect(book.scale.x).toBeGreaterThan(1.45);
    expect(rig.root.userData.activityStrategyBookletVisualScale).toBeGreaterThan(1.45);
    expect(book.position.y).toBeGreaterThan(-.28);
    expect(book.position.z).toBeGreaterThan(.98);
    expect(book.rotation.x).toBeGreaterThan(-.30);
    expect(Math.abs(leftPage.rotation.y)).toBeGreaterThan(.50);
    expect(Math.abs(rightPage.rotation.y)).toBeGreaterThan(.50);
    expect(leftPaper.geometry.parameters.height).toBeGreaterThan(.40);
    expect(rightPaper.geometry.parameters.height).toBeGreaterThan(.40);
    expect(rig.root.getObjectsByProperty('name', 'strategy-booklet-text-line').length).toBeGreaterThanOrEqual(14);
    expect(rig.root.getObjectsByProperty('name', 'strategy-booklet-diagram-dark-square')).toHaveLength(8);
    expect(rig.root.getObjectByName('strategy-booklet-central-fold')).toBeTruthy();
    expect(rig.root.getObjectByName('strategy-booklet-spine')).toBeTruthy();

    expect(rig.activityRig.objectInteractionSurface.visible).toBe(false);
    expect(rig.activityRig.support.visible).toBe(true);
    expect(rig.activityRig.assist.visible).toBe(true);
    expect(rig.activityRig.supportGlove.position.distanceTo(result.supportTarget)).toBeLessThan(1e-6);
    expect(rig.activityRig.assistGlove.position.distanceTo(result.assistTarget)).toBeLessThan(1e-6);
    expect(rig.activityRig.supportGlove.position.x).toBeGreaterThan(.20);
    expect(rig.activityRig.assistGlove.position.x).toBeLessThan(-.20);
    expect(rig.headPivot.rotation.x).toBeGreaterThan(headBeforeBooklet + .12);

    disposeMatthiasPremiumHome3D(rig);
  });

  it('lee por líneas y pasa una hoja de forma ocasional, no como un ventilador', () => {
    const start = matthiasStrategyBookletReadingState(.1);
    const later = matthiasStrategyBookletReadingState(1.8);
    const nextLine = matthiasStrategyBookletReadingState(2.6);
    const turning = matthiasStrategyBookletReadingState(6.5);
    const resting = matthiasStrategyBookletReadingState(8.5);
    const reduced = matthiasStrategyBookletReadingState(6.5, { reducedMotion: true });
    const speaking = matthiasStrategyBookletReadingState(6.5, { speaking: true });

    expect(later.scanX).toBeGreaterThan(start.scanX + .015);
    expect(nextLine.scanY).toBeLessThan(start.scanY);
    expect(turning.pageVisible).toBe(true);
    expect(turning.pageTurn).toBeGreaterThan(.4);
    expect(turning.pageAngle).toBeLessThan(-.6);
    expect(resting.pageVisible).toBe(false);
    expect(resting.pageTurn).toBe(0);
    expect(reduced.pageVisible).toBe(false);
    expect(reduced.scanX).toBe(0);
    expect(speaking.pageVisible).toBe(false);
    expect(speaking.scanY).toBe(0);
  });

  it('articula la hoja real y limpia el estado al dejar de leer', () => {
    const rig = createMatthiasPremiumHome3D();
    const reading = applyBase(rig, 'read', { activityTime: 6.5 });
    const active = applyMatthiasStrategyBookletRig(rig, reading);

    expect(active?.pageTurn).toBeGreaterThan(.4);
    expect(rig.activityRig.strategyBookletPageTurnPivot.visible).toBe(true);
    expect(rig.activityRig.strategyBookletPageTurnPivot.rotation.y).toBeLessThan(-.6);
    expect(rig.root.userData.activityStrategyBookletState).toBe('reading');

    applyBase(rig, 'idle');
    expect(clearMatthiasStrategyBookletRig(rig)).toBe(1);
    expect(rig.activityRig.strategyBookletPageTurnPivot.visible).toBe(false);
    expect(rig.root.userData.activityStrategyBookletState).toBe('inactive');
    expect(rig.root.userData.activityStrategyBookletPageTurn).toBe(0);

    disposeMatthiasPremiumHome3D(rig);
  });
});
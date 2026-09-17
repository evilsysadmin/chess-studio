import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import {
  HOME_CASTLE_PROP_FOCUS_DEPTH,
  HOME_CASTLE_PROP_FOCUS_LIFT,
  HOME_CASTLE_PROP_FOCUS_MAX_EMISSIVE,
  applyHomeCastleDestinationPropFocus,
} from './HomeCastle3DPropFocus.js';

function createProp(baseEmissive = 0.08) {
  const group = new THREE.Group();
  group.position.set(0.2, -0.1, 0.3);
  group.rotation.set(-0.02, 0.01, 0.03);
  const geometry = new THREE.BoxGeometry(0.1, 0.1, 0.1);
  const material = new THREE.MeshStandardMaterial({ emissive: 0x332211 });
  material.emissiveIntensity = baseEmissive;
  const mesh = new THREE.Mesh(geometry, material);
  group.add(mesh);
  return {
    group,
    material,
    dispose() {
      geometry.dispose();
      material.dispose();
    },
  };
}

describe('HomeCastle3DPropFocus', () => {
  it('boosts only the focused destination and gives it a restrained physical lift', () => {
    const play = createProp(0.08);
    const daily = createProp(0.05);
    const initialScale = play.group.scale.clone();
    const initialPlayPosition = play.group.position.clone();
    const initialDailyPosition = daily.group.position.clone();

    applyHomeCastleDestinationPropFocus({ play: play.group, daily: daily.group }, 'play', false);

    expect(play.material.emissiveIntensity).toBeGreaterThan(0.08);
    expect(play.material.emissiveIntensity).toBeLessThanOrEqual(HOME_CASTLE_PROP_FOCUS_MAX_EMISSIVE);
    expect(daily.material.emissiveIntensity).toBeCloseTo(0.05, 6);
    expect(play.group.position.y).toBeGreaterThan(initialPlayPosition.y);
    expect(play.group.position.y).toBeLessThan(initialPlayPosition.y + HOME_CASTLE_PROP_FOCUS_LIFT);
    expect(play.group.position.z).toBeGreaterThan(initialPlayPosition.z);
    expect(play.group.position.z).toBeLessThan(initialPlayPosition.z + HOME_CASTLE_PROP_FOCUS_DEPTH);
    expect(daily.group.position.equals(initialDailyPosition)).toBe(true);
    expect(play.group.scale.equals(initialScale)).toBe(true);

    play.dispose();
    daily.dispose();
  });

  it('returns to the original material intensity and transform without compounding stored bases', () => {
    const combat = createProp(0.1);
    const originalPosition = combat.group.position.clone();
    const originalRotation = combat.group.rotation.clone();

    applyHomeCastleDestinationPropFocus({ combat: combat.group }, 'combat', true);
    const focusedIntensity = combat.material.emissiveIntensity;
    applyHomeCastleDestinationPropFocus({ combat: combat.group }, 'combat', true);

    expect(combat.material.emissiveIntensity).toBe(focusedIntensity);
    expect(combat.material.userData.homeCastleBaseEmissiveIntensity).toBe(0.1);
    expect(combat.group.position.equals(originalPosition)).toBe(true);
    expect(combat.group.rotation.equals(originalRotation)).toBe(true);

    applyHomeCastleDestinationPropFocus({ combat: combat.group }, null, true);
    expect(combat.material.emissiveIntensity).toBe(0.1);
    expect(combat.group.position.equals(originalPosition)).toBe(true);
    expect(combat.group.rotation.equals(originalRotation)).toBe(true);

    combat.dispose();
  });

  it('uses a restrained lerp during normal motion and snaps material focus under reduced motion', () => {
    const history = createProp(0.04);

    applyHomeCastleDestinationPropFocus({ history: history.group }, 'history', false);
    const firstStep = history.material.emissiveIntensity;
    expect(firstStep).toBeGreaterThan(0.04);
    expect(firstStep).toBeLessThan(0.095);

    applyHomeCastleDestinationPropFocus({ history: history.group }, 'history', true);
    expect(history.material.emissiveIntensity).toBeCloseTo(0.095, 6);

    history.dispose();
  });

  it('caps unusually bright materials instead of turning focus into a glow spike', () => {
    const bright = createProp(0.3);

    applyHomeCastleDestinationPropFocus({ play: bright.group }, 'play', true);

    expect(bright.material.emissiveIntensity).toBe(HOME_CASTLE_PROP_FOCUS_MAX_EMISSIVE);

    bright.dispose();
  });

  it('ignores null groups, unknown destinations and materials without emissive intensity', () => {
    const play = createProp(0.07);
    const basic = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const basicGeometry = new THREE.BoxGeometry(0.1, 0.1, 0.1);
    play.group.add(new THREE.Mesh(basicGeometry, basic));

    expect(() => applyHomeCastleDestinationPropFocus(
      { play: play.group, missing: null },
      'not-a-room',
      true,
    )).not.toThrow();
    expect(play.material.emissiveIntensity).toBe(0.07);

    basicGeometry.dispose();
    basic.dispose();
    play.dispose();
  });
});

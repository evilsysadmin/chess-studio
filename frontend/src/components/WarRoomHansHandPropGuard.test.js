import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import {
  reconcileWarRoomHansSingleHandProps,
  rigWarRoomHansSingleHandProp,
} from './WarRoomHansHandPropGuard.js';

function actorFixture() {
  const hans = new THREE.Group();
  hans.visible = true;
  const rightArm = new THREE.Group();
  rightArm.name = 'war-room-hans-right-arm';
  hans.add(rightArm);
  return { hans, body: { rightArm } };
}

function addProp(hans, name) {
  const prop = new THREE.Group();
  prop.name = name;
  prop.visible = true;
  hans.add(prop);
  return prop;
}

describe('WarRoomHansHandPropGuard', () => {
  it('parents the watering can to the right hand without erasing the pouring rotation', () => {
    const actor = actorFixture();
    const can = addProp(actor.hans, 'war-room-hans-watering-can');
    can.rotation.z = -0.63;
    actor.hans.userData.warRoomHansActiveTaskKind = 'service';
    actor.hans.userData.warRoomHansServiceEvent = 'water-plant';

    expect(reconcileWarRoomHansSingleHandProps(actor)).toBe(true);
    expect(can.parent).toBe(actor.body.rightArm);
    expect(can.position.toArray()).toEqual([0.045, -0.62, 0.075]);
    expect(can.rotation.z).toBeCloseTo(-0.63, 8);
    expect(can.userData.warRoomHansHandPropHand).toBe('right');
  });

  it.each([
    ['dust-board', 'war-room-hans-chore-prop-duster'],
    ['sweep-ashes', 'war-room-hans-chore-prop-ash-brush'],
  ])('keeps %s tool physically attached while the arm pose animates', (eventName, propName) => {
    const actor = actorFixture();
    const prop = addProp(actor.hans, propName);
    actor.hans.userData.warRoomHansActiveTaskKind = 'chore';
    actor.hans.userData.warRoomHansChoreEvent = eventName;

    expect(reconcileWarRoomHansSingleHandProps(actor)).toBe(true);
    expect(prop.parent).toBe(actor.body.rightArm);
    expect(prop.position.y).toBeCloseTo(-0.62, 8);
    expect(prop.userData.warRoomHansHandPropHand).toBe('right');
  });

  it('reasserts the hand-local position after a legacy routine resets a reused prop', () => {
    const actor = actorFixture();
    const duster = addProp(actor.hans, 'war-room-hans-chore-prop-duster');
    actor.hans.userData.warRoomHansActiveTaskKind = 'chore';
    actor.hans.userData.warRoomHansChoreEvent = 'dust-board';

    reconcileWarRoomHansSingleHandProps(actor);
    duster.position.set(0.35, 0.75, 0.22);
    expect(reconcileWarRoomHansSingleHandProps(actor)).toBe(true);
    expect(duster.position.toArray()).toEqual([0.055, -0.62, 0.08]);
  });

  it('does not steal props from two-hand or floor-owned tasks', () => {
    const actor = actorFixture();
    const tray = addProp(actor.hans, 'war-room-hans-espresso-tray');
    actor.hans.userData.warRoomHansActiveTaskKind = 'service';
    actor.hans.userData.warRoomHansServiceEvent = 'espresso';

    expect(reconcileWarRoomHansSingleHandProps(actor)).toBe(false);
    expect(tray.parent).toBe(actor.hans);
  });

  it('supports direct rigging for a visible single-hand prop', () => {
    const actor = actorFixture();
    const prop = addProp(actor.hans, 'tool');
    expect(rigWarRoomHansSingleHandProp(actor, prop, {
      position: [0.1, -0.5, 0.2],
      rotation: [0.2, 0.3, 0.4],
    })).toBe(true);
    expect(prop.parent).toBe(actor.body.rightArm);
    expect(prop.position.toArray()).toEqual([0.1, -0.5, 0.2]);
    expect(prop.rotation.toArray().slice(0, 3)).toEqual([0.2, 0.3, 0.4]);
  });
});

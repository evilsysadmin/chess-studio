import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import {
  reconcileWarRoomHansSingleHandProps,
  reconcileWarRoomHansTwoHandProps,
  rigWarRoomHansSingleHandProp,
  rigWarRoomHansTwoHandProp,
} from './WarRoomHansHandPropGuard.js';

function actorFixture() {
  const hans = new THREE.Group();
  hans.visible = true;
  const rightArm = new THREE.Group();
  rightArm.name = 'war-room-hans-right-arm';
  const torso = new THREE.Group();
  torso.name = 'war-room-hans-torso';
  torso.position.y = 1.36;
  const carriedLog = new THREE.Group();
  carriedLog.name = 'war-room-hans-carried-log';
  carriedLog.position.set(0.52, 1.05, 0.22);
  carriedLog.visible = false;
  hans.add(rightArm, torso, carriedLog);
  return { hans, body: { rightArm, torso, carriedLog } };
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

  it.each([
    ['service', 'espresso', 'war-room-hans-espresso-tray', -0.34, 0.48],
    ['chore', 'bring-book', 'war-room-hans-chore-prop-book', -0.56, 0.32],
    ['chore', 'mail', 'war-room-hans-chore-prop-letters', -0.56, 0.32],
  ])('anchors %s:%s between both hands on the torso', (kind, eventName, propName, torsoY, forwardZ) => {
    const actor = actorFixture();
    const prop = addProp(actor.hans, propName);
    actor.hans.userData.warRoomHansActiveTaskKind = kind;
    if (kind === 'service') actor.hans.userData.warRoomHansServiceEvent = eventName;
    else actor.hans.userData.warRoomHansChoreEvent = eventName;

    expect(reconcileWarRoomHansTwoHandProps(actor)).toBe(true);
    expect(prop.parent).toBe(actor.body.torso);
    expect(prop.position.toArray()).toEqual([0, torsoY, forwardZ]);
    expect(prop.userData.warRoomHansHandPropHand).toBe('two-hand-torso-anchor');
  });

  it('centers the carried hearth log across both hands while preserving its horizontal rotation', () => {
    const actor = actorFixture();
    const log = actor.body.carriedLog;
    log.visible = true;
    log.rotation.z = Math.PI / 2 + 0.06;

    expect(reconcileWarRoomHansTwoHandProps(actor)).toBe(true);
    expect(log.parent).toBe(actor.body.torso);
    expect(log.position.toArray()).toEqual([0, -0.31, 0.30]);
    expect(log.rotation.z).toBeCloseTo(Math.PI / 2 + 0.06, 8);
    expect(log.userData.warRoomHansHandPropHand).toBe('two-hand-torso-anchor');
  });

  it('keeps the mop and bucket floor-owned instead of parenting them to an animated arm', () => {
    const actor = actorFixture();
    const mop = addProp(actor.hans, 'war-room-hans-mop');
    const bucket = addProp(actor.hans, 'war-room-hans-mop-bucket');
    actor.hans.userData.warRoomHansActiveTaskKind = 'mop';
    actor.hans.userData.warRoomHansActiveTask = 'mop-room';

    expect(reconcileWarRoomHansSingleHandProps(actor)).toBe(false);
    expect(reconcileWarRoomHansTwoHandProps(actor)).toBe(false);
    expect(mop.parent).toBe(actor.hans);
    expect(bucket.parent).toBe(actor.hans);
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

  it('supports a direct two-hand torso anchor', () => {
    const actor = actorFixture();
    const prop = addProp(actor.hans, 'parcel');
    expect(rigWarRoomHansTwoHandProp(actor, prop, {
      torsoY: -0.4,
      forwardZ: 0.25,
      rotation: [0.1, 0.2, 0.3],
    })).toBe(true);
    expect(prop.parent).toBe(actor.body.torso);
    expect(prop.position.toArray()).toEqual([0, -0.4, 0.25]);
    expect(prop.rotation.toArray().slice(0, 3)).toEqual([0.1, 0.2, 0.3]);
  });
});

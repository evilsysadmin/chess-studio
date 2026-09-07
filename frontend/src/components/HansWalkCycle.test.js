import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import {
  applyHansWalkCycle,
  createHansWalkCycle,
  ensureHansArticulatedLegs,
  HANS_WALK_CYCLE_VERSION,
  resetHansWalkCycle,
  sampleHansWalkCycle,
} from './HansWalkCycle.js';

function makeRigidLeg(x) {
  const leg = new THREE.Group();
  leg.position.set(x, 0.82, 0);
  const material = new THREE.MeshBasicMaterial();
  const rigid = new THREE.Mesh(new THREE.CylinderGeometry(0.095, 0.085, 0.72, 9), material);
  rigid.position.y = -0.34;
  const shoe = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.12, 0.38), material);
  shoe.position.set(0, -0.74, 0.07);
  leg.add(rigid, shoe);
  return { leg, shoe };
}

function makeBody() {
  const left = makeRigidLeg(-0.17);
  const right = makeRigidLeg(0.17);
  return {
    leftLeg: left.leg,
    rightLeg: right.leg,
  };
}

describe('Hans reusable walk cycle', () => {
  it('upgrades the rigid Playmobil legs into thigh-knee-shin-foot chains without moving the shoes', () => {
    const body = makeBody();
    const leftShoeYBefore = body.leftLeg.children.find((child) => child.geometry?.type === 'BoxGeometry').position.y;

    expect(ensureHansArticulatedLegs(body)).toBe(true);
    expect(body.leftKnee).toBeTruthy();
    expect(body.rightKnee).toBeTruthy();
    expect(body.leftShin).toBeTruthy();
    expect(body.rightShin).toBeTruthy();
    expect(body.leftShoe.parent).toBe(body.leftKnee);
    expect(body.rightShoe.parent).toBe(body.rightKnee);
    expect(body.leftLeg.userData.hansLegArticulation).toBe(HANS_WALK_CYCLE_VERSION);
    expect(body.leftKnee.position.y + body.leftShoe.position.y).toBeCloseTo(leftShoeYBefore, 6);
  });

  it('produces alternating knee flex and foot counter-rotation from travelled distance', () => {
    const body = makeBody();
    const controller = createHansWalkCycle(body, { forward: 1 });
    expect(controller).toBeTruthy();

    const quarterCycle = sampleHansWalkCycle(0.26 / 4);
    expect(quarterCycle.leftKnee).toBeGreaterThan(quarterCycle.rightKnee + 0.3);

    applyHansWalkCycle(controller, { distance: 0.26 / 4, horizontalWeight: 1 });
    expect(body.leftKnee.rotation.x).toBeGreaterThan(body.rightKnee.rotation.x + 0.4);
    expect(body.leftShoe.rotation.x).toBeLessThan(0);
    expect(body.rightShoe.rotation.x).toBeLessThanOrEqual(0);

    const leftBent = body.leftKnee.rotation.x;
    applyHansWalkCycle(controller, { distance: 0.26 * 0.75, horizontalWeight: 1 });
    expect(body.rightKnee.rotation.x).toBeGreaterThan(body.leftKnee.rotation.x + 0.4);
    expect(body.leftKnee.rotation.x).toBeLessThan(leftBent);
  });

  it('can be reset cleanly so action poses do not inherit a walking knee', () => {
    const body = makeBody();
    const controller = createHansWalkCycle(body);
    applyHansWalkCycle(controller, { distance: 0.26 / 4, horizontalWeight: 1 });
    expect(Math.abs(body.leftKnee.rotation.x)).toBeGreaterThan(0.4);

    resetHansWalkCycle(controller);
    expect(body.leftKnee.rotation.x).toBeCloseTo(0, 6);
    expect(body.rightKnee.rotation.x).toBeCloseTo(0, 6);
    expect(body.leftShoe.rotation.x).toBeCloseTo(0, 6);
    expect(body.rightShoe.rotation.x).toBeCloseTo(0, 6);
  });
});

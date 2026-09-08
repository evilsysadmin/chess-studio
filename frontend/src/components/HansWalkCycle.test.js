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
  return { leftLeg: left.leg, rightLeg: right.leg };
}

describe('Hans reusable walk cycle', () => {
  it('upgrades rigid legs into a hip-knee-ankle-foot chain without moving the shoe', () => {
    const body = makeBody();
    const shoe = body.leftLeg.children.find((child) => child.geometry?.type === 'BoxGeometry');
    const before = new THREE.Vector3();
    shoe.getWorldPosition(before);

    expect(ensureHansArticulatedLegs(body)).toBe(true);
    body.leftLeg.updateMatrixWorld(true);
    const after = new THREE.Vector3();
    body.leftShoe.getWorldPosition(after);

    expect(body.leftKnee).toBeTruthy();
    expect(body.leftAnkle).toBeTruthy();
    expect(body.leftShoe.parent).toBe(body.leftAnkle);
    expect(body.leftAnkle.parent).toBe(body.leftKnee);
    expect(body.leftLeg.userData.hansLegArticulation).toBe(HANS_WALK_CYCLE_VERSION);
    expect(after.distanceTo(before)).toBeLessThan(1e-6);
  });

  it('describes alternating foot targets instead of hard-coded joint kicks', () => {
    const a = sampleHansWalkCycle(0.26 * 0.25);
    const b = sampleHansWalkCycle(0.26 * 0.75);

    expect(Math.abs(a.leftFootForward - a.rightFootForward)).toBeGreaterThan(0.03);
    expect(Math.abs(b.leftFootForward - b.rightFootForward)).toBeGreaterThan(0.03);
    expect(a.leftLift + a.rightLift).toBeLessThanOrEqual(0.03);
    expect(b.leftLift + b.rightLift).toBeLessThanOrEqual(0.03);
  });

  it('solves knees from foot targets and keeps flex inside the gait contract', () => {
    const body = makeBody();
    const controller = createHansWalkCycle(body, { forward: 1 });
    expect(controller).toBeTruthy();

    const sample = applyHansWalkCycle(controller, { distance: 0.26 * 0.72, horizontalWeight: 1 });
    expect(sample.leftKnee).toBeGreaterThan(0.04);
    expect(sample.leftKnee).toBeLessThanOrEqual(0.72);
    expect(sample.rightKnee).toBeGreaterThan(0.04);
    expect(sample.rightKnee).toBeLessThanOrEqual(0.72);
    expect(Math.max(sample.leftKnee, sample.rightKnee)).toBeGreaterThan(0.45);

    const leftWorldPitch = body.leftLeg.rotation.x + body.leftKnee.rotation.x + body.leftAnkle.rotation.x;
    const rightWorldPitch = body.rightLeg.rotation.x + body.rightKnee.rotation.x + body.rightAnkle.rotation.x;
    expect(Math.abs(leftWorldPitch)).toBeLessThan(0.13);
    expect(Math.abs(rightWorldPitch)).toBeLessThan(0.13);
  });

  it('resets the whole gait chain before action poses', () => {
    const body = makeBody();
    const controller = createHansWalkCycle(body);
    applyHansWalkCycle(controller, { distance: 0.26 * 0.72 });
    expect(Math.max(Math.abs(body.leftKnee.rotation.x), Math.abs(body.rightKnee.rotation.x))).toBeGreaterThan(0.2);

    resetHansWalkCycle(controller);
    expect(body.leftLeg.rotation.x).toBeCloseTo(0, 6);
    expect(body.rightLeg.rotation.x).toBeCloseTo(0, 6);
    expect(body.leftKnee.rotation.x).toBeCloseTo(0, 6);
    expect(body.rightKnee.rotation.x).toBeCloseTo(0, 6);
    expect(body.leftAnkle.rotation.x).toBeCloseTo(0, 6);
    expect(body.rightAnkle.rotation.x).toBeCloseTo(0, 6);
  });
});

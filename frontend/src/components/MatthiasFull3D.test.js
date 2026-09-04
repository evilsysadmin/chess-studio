import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import {
  applyMatthiasFull3DPose,
  createMatthiasFull3D,
  disposeMatthiasFull3D,
  MATTHIAS_FULL3D_BODY_MOTION_VERSION,
  MATTHIAS_FULL3D_FACE_RIG_VERSION,
  MATTHIAS_FULL3D_FIDELITY_VERSION,
  MATTHIAS_FULL3D_MODEL_VERSION,
  MATTHIAS_FULL3D_RENDER_CONTRACT,
  matthiasFull3DBodyMotionSample,
} from './MatthiasFull3D.js';

describe('MatthiasFull3D', () => {
  it('is real 3D geometry with versioned face/body rigs and canonical-front contract', () => {
    const rig = createMatthiasFull3D();
    const box = new THREE.Box3().setFromObject(rig.root);
    const size = new THREE.Vector3();
    box.getSize(size);

    expect(rig.root.name).toBe(MATTHIAS_FULL3D_MODEL_VERSION);
    expect(rig.root.userData.faceRigVersion).toBe(MATTHIAS_FULL3D_FACE_RIG_VERSION);
    expect(rig.root.userData.bodyMotionVersion).toBe(MATTHIAS_FULL3D_BODY_MOTION_VERSION);
    expect(rig.root.userData.fidelityVersion).toBe(MATTHIAS_FULL3D_FIDELITY_VERSION);
    expect(rig.root.userData.renderContract).toBe(MATTHIAS_FULL3D_RENDER_CONTRACT);
    expect(size.x).toBeGreaterThan(1);
    expect(size.y).toBeGreaterThan(2);
    expect(size.z).toBeGreaterThan(.7);
    expect(rig.leftEye.isMesh).toBe(true);
    expect(rig.rightEye.isMesh).toBe(true);
    expect(rig.mouthGroup.isGroup).toBe(true);
    expect(rig.full3d.posturePivot.isGroup).toBe(true);
    expect(rig.full3d.leftUpperLid.isMesh).toBe(true);
    expect(rig.full3d.rightLowerLid.isMesh).toBe(true);

    disposeMatthiasFull3D(rig);
  });

  it('blinks with eyelid geometry instead of flattening the eyeballs', () => {
    const rig = createMatthiasFull3D();
    const openUpper = rig.full3d.leftUpperLid.position.y;
    const openLower = rig.full3d.leftLowerLid.position.y;

    applyMatthiasFull3DPose(rig, {
      bodyY: 0,
      bodyYaw: 0,
      headPitch: 0,
      headYaw: 0,
      headRoll: 0,
      gazeX: 0,
      browBias: 0,
      smirk: 0,
      mouthOpen: 0,
      blink: 1,
    });

    expect(rig.leftEye.scale.y).toBeCloseTo(1.30, 5);
    expect(rig.rightEye.scale.y).toBeCloseTo(1.30, 5);
    expect(rig.full3d.leftUpperLid.position.y).toBeLessThan(openUpper);
    expect(rig.full3d.leftLowerLid.position.y).toBeGreaterThan(openLower);
    expect(rig.full3d.leftUpperLid.position.y - rig.full3d.leftLowerLid.position.y).toBeLessThan(.03);

    disposeMatthiasFull3D(rig);
  });

  it('keeps gaze, brows and speech mouth as independent 3D parts', () => {
    const rig = createMatthiasFull3D();
    const leftEyeX = rig.leftEye.position.x;
    const leftBrowY = rig.leftBrow.position.y;

    applyMatthiasFull3DPose(rig, {
      bodyY: 0,
      bodyYaw: 0,
      headPitch: -.03,
      headYaw: .12,
      headRoll: -.03,
      gazeX: -.025,
      browBias: .03,
      smirk: .4,
      mouthOpen: .75,
      blink: 0,
    });

    expect(rig.leftEye.position.x).toBeLessThan(leftEyeX);
    expect(rig.leftBrow.position.y).toBeGreaterThan(leftBrowY);
    expect(rig.mouthGroup.visible).toBe(false);
    expect(rig.speechMouth.visible).toBe(true);
    expect(rig.headPivot.rotation.y).toBeCloseTo(.12, 5);

    disposeMatthiasFull3D(rig);
  });

  it('turns the existing pose into restrained physical weight transfer without zoom', () => {
    const rig = createMatthiasFull3D();
    const baseBodyY = rig.full3d.bodyBaseY;

    applyMatthiasFull3DPose(rig, {
      bodyY: .006,
      bodyYaw: .006,
      headPitch: -.04,
      headYaw: .08,
      headRoll: .02,
      gazeX: 0,
      browBias: 0,
      smirk: 0,
      mouthOpen: 0,
      blink: 0,
    });

    expect(Math.abs(rig.full3d.posturePivot.position.x)).toBeGreaterThan(.01);
    expect(Math.abs(rig.full3d.posturePivot.position.x)).toBeLessThanOrEqual(.03);
    expect(Math.abs(rig.full3d.posturePivot.rotation.z)).toBeGreaterThan(.002);
    expect(Math.abs(rig.full3d.posturePivot.rotation.z)).toBeLessThanOrEqual(.013);
    expect(Math.abs(rig.full3d.posturePivot.rotation.x)).toBeLessThanOrEqual(.009);
    expect(rig.body.position.y).toBeGreaterThan(baseBodyY);

    // Full-body motion is screen-plane posture only: no fake approach toward the
    // camera and no scale-based breathing/zoom.
    expect(rig.full3d.posturePivot.position.z).toBe(0);
    expect(rig.full3d.posturePivot.scale.toArray()).toEqual([1, 1, 1]);
    expect(rig.root.scale.toArray()).toEqual([1, 1, 1]);

    applyMatthiasFull3DPose(rig, {
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
    });

    expect(rig.full3d.posturePivot.position.toArray()).toEqual([0, 0, 0]);
    expect(rig.full3d.posturePivot.rotation.x).toBe(0);
    expect(rig.full3d.posturePivot.rotation.z).toBe(0);
    expect(rig.body.position.y).toBeCloseTo(baseBodyY, 6);

    disposeMatthiasFull3D(rig);
  });

  it('hard-clamps body motion even when a caller supplies absurd pose values', () => {
    const motion = matthiasFull3DBodyMotionSample({
      bodyY: 99,
      bodyYaw: 99,
      headPitch: -99,
      headYaw: 99,
      headRoll: -99,
    });

    expect(Math.abs(motion.x)).toBeLessThanOrEqual(.03);
    expect(Math.abs(motion.roll)).toBeLessThanOrEqual(.013);
    expect(Math.abs(motion.pitch)).toBeLessThanOrEqual(.009);
    expect(Math.abs(motion.chestLift)).toBeLessThanOrEqual(.006);
  });
});

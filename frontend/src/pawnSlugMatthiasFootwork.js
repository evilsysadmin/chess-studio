import * as THREE from 'three';

const TAU = Math.PI * 2;
const RUN_FRAMES = 16;

export const PAWN_SLUG_MATTHIAS_FOOTWORK = Object.freeze({
  frameCount: RUN_FRAMES,
  stride: 0.082,
  footLift: 0.058,
  shinSwing: 0.17,
  bootPitch: 0.11,
  baseFootX: 0.075,
  baseFootY: 0.045,
  layerZ: 0.045,
  purpose: 'visible-alternating-footfall-over-authored-run-atlas',
});

function wrapFrame(frame, count = RUN_FRAMES) {
  const safeCount = Math.max(1, Math.floor(Number(count) || RUN_FRAMES));
  return ((Math.floor(Number(frame) || 0) % safeCount) + safeCount) % safeCount;
}

function footPose(signal, side) {
  const direction = side === 'left' ? -1 : 1;
  const swing = Number(signal) || 0;
  const lift = Math.max(0, swing) * PAWN_SLUG_MATTHIAS_FOOTWORK.footLift;
  const planted = Math.max(0, -swing);
  return Object.freeze({
    x: direction * PAWN_SLUG_MATTHIAS_FOOTWORK.baseFootX
      + swing * PAWN_SLUG_MATTHIAS_FOOTWORK.stride,
    y: PAWN_SLUG_MATTHIAS_FOOTWORK.baseFootY + lift,
    shinX: direction * PAWN_SLUG_MATTHIAS_FOOTWORK.baseFootX * 0.7
      + swing * PAWN_SLUG_MATTHIAS_FOOTWORK.stride * 0.52,
    shinY: 0.145 + lift * 0.42,
    shinRotation: -swing * PAWN_SLUG_MATTHIAS_FOOTWORK.shinSwing,
    bootRotation: -swing * PAWN_SLUG_MATTHIAS_FOOTWORK.bootPitch,
    planted,
    airborne: Math.max(0, swing),
  });
}

export function pawnSlugMatthiasStridePose(frameIndex = 0) {
  const frame = wrapFrame(frameIndex);
  const phase = (frame / RUN_FRAMES) * TAU;
  const leftSignal = Math.sin(phase);
  const rightSignal = -leftSignal;
  return Object.freeze({
    frame,
    phase,
    left: footPose(leftSignal, 'left'),
    right: footPose(rightSignal, 'right'),
  });
}

function bootGeometry() {
  const shape = new THREE.Shape();
  shape.moveTo(-0.115, -0.035);
  shape.lineTo(0.082, -0.035);
  shape.quadraticCurveTo(0.145, -0.03, 0.155, 0.018);
  shape.quadraticCurveTo(0.11, 0.054, 0.012, 0.05);
  shape.lineTo(-0.105, 0.036);
  shape.quadraticCurveTo(-0.13, 0.006, -0.115, -0.035);
  return new THREE.ShapeGeometry(shape, 5);
}

function makeBoot(material) {
  const boot = new THREE.Mesh(bootGeometry(), material);
  boot.castShadow = false;
  boot.receiveShadow = false;
  return boot;
}

function makeShin(material) {
  const shin = new THREE.Mesh(new THREE.PlaneGeometry(0.09, 0.255), material);
  shin.castShadow = false;
  shin.receiveShadow = false;
  return shin;
}

export function attachPawnSlugMatthiasFootwork(sprite) {
  if (!sprite || sprite.userData?.pawnSlugFootwork) return sprite?.userData?.pawnSlugFootwork || null;

  const bootMaterial = new THREE.MeshStandardMaterial({
    color: 0x17191c,
    roughness: 0.68,
    metalness: 0.08,
    depthWrite: true,
  });
  const clothMaterial = new THREE.MeshStandardMaterial({
    color: 0x24272a,
    roughness: 0.94,
    metalness: 0.01,
    depthWrite: true,
  });

  const root = new THREE.Group();
  root.name = 'pawn-slug-matthias-footwork';
  root.position.z = PAWN_SLUG_MATTHIAS_FOOTWORK.layerZ;
  root.visible = false;

  const leftShin = makeShin(clothMaterial);
  const rightShin = makeShin(clothMaterial);
  const leftBoot = makeBoot(bootMaterial);
  const rightBoot = makeBoot(bootMaterial);
  leftShin.name = 'pawn-slug-matthias-left-shin';
  rightShin.name = 'pawn-slug-matthias-right-shin';
  leftBoot.name = 'pawn-slug-matthias-left-boot';
  rightBoot.name = 'pawn-slug-matthias-right-boot';

  root.add(leftShin, rightShin, leftBoot, rightBoot);
  sprite.add(root);
  const refs = Object.freeze({ root, leftShin, rightShin, leftBoot, rightBoot });
  sprite.userData.pawnSlugFootwork = refs;
  return refs;
}

function applySide(refs, side, pose) {
  const shin = side === 'left' ? refs.leftShin : refs.rightShin;
  const boot = side === 'left' ? refs.leftBoot : refs.rightBoot;
  shin.position.set(pose.shinX, pose.shinY, 0);
  shin.rotation.z = pose.shinRotation;
  boot.position.set(pose.x, pose.y, 0.012);
  boot.rotation.z = pose.bootRotation;
  const plantSquash = 1 + pose.planted * 0.05;
  boot.scale.set(plantSquash, 1 - pose.planted * 0.025, 1);
}

export function applyPawnSlugMatthiasFootwork(sprite, state = {}) {
  const refs = sprite?.userData?.pawnSlugFootwork || attachPawnSlugMatthiasFootwork(sprite);
  if (!refs) return null;
  const running = Boolean(state.running) && !state.airborne && !state.crouch;
  refs.root.visible = running;
  if (!running) return null;

  const animationFrame = sprite.userData?.animation?.frameIndex;
  const frame = Number.isFinite(state.runFrame) ? state.runFrame : animationFrame;
  const stride = pawnSlugMatthiasStridePose(frame);
  applySide(refs, 'left', stride.left);
  applySide(refs, 'right', stride.right);
  sprite.userData.pawnSlugFootPose = stride;
  return stride;
}

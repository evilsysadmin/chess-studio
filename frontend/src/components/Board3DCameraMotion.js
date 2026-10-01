import * as THREE from 'three';

const MOBILE_PAN_X = 2.2;
const MOBILE_PAN_Z = 1.55;

export function setBoard3DMobilePan(motion, pan = {}, whiteSide = true) {
  motion.x = THREE.MathUtils.clamp(Number(pan.x) || 0, -1, 1) * -MOBILE_PAN_X;
  motion.y = THREE.MathUtils.clamp(Number(pan.y) || 0, -1, 1) * MOBILE_PAN_Z * (whiteSide ? 1 : -1);
  return motion;
}

export function resetBoard3DMobilePan(motion) {
  motion.x = 0;
  motion.y = 0;
  return motion;
}

export function applyBoard3DCameraMotion(camera, motion, {
  euler = new THREE.Euler(),
  offset = new THREE.Vector3(),
  target = new THREE.Vector3(),
} = {}) {
  const basePosition = camera?.userData?.basePosition;
  const baseTarget = camera?.userData?.baseTarget;
  if (!basePosition || !baseTarget) return false;
  target.copy(baseTarget);
  target.x += Number(motion?.x) || 0;
  target.z += Number(motion?.y) || 0;
  euler.set(Number(motion?.pitch) || 0, Number(motion?.yaw) || 0, 0, 'YXZ');
  offset.copy(basePosition).sub(baseTarget).applyEuler(euler);
  camera.position.copy(target).add(offset);
  camera.lookAt(target);
  return true;
}

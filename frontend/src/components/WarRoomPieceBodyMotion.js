import { squarePosition } from './Board3DBoardMath.js';
import {
  armWarRoomMoveLightGuard,
  clearWarRoomMoveLightGuard,
  hasWarRoomMoveLightGuard,
} from './WarRoomMoveAnimationLifecycle.js';
import { installPieceBodyMotion as installPieceBodyMotionImpl } from './WarRoomPieceBodyMotionImpl.js';

export {
  BODY_PROFILES,
  derivePassiveCheckSettle,
  derivePieceBodyPose,
  derivePromotionMorph,
  resetPieceBodyMotion,
} from './WarRoomPieceBodyMotionImpl.js';

const MOVE_EPSILON = 0.002;

function owningScene(group) {
  let node = group;
  while (node && !node.isScene) node = node.parent;
  return node?.isScene ? node : null;
}

function installMoveLightRollback(group) {
  if (!group?.isObject3D || group.userData?.board3DMoveLightGuardProfile) return group;
  const body = group.children.find((child) => child.userData?.board3DBodyMotionBody);
  if (!body) return group;

  // Every visible body mesh receives an onBeforeRender callback. Cache the
  // target per piece, not per callback: the square normally stays unchanged
  // for dozens of renders, yet the guard must still check movement every time.
  let cachedSquare = null;
  let cachedTarget = null;
  let wrapped = 0;
  body.traverse((child) => {
    if (!child?.isMesh) return;
    const previous = child.onBeforeRender;
    child.onBeforeRender = function onBeforeRender(...args) {
      const scene = args[1];
      const targetSquare = String(group.userData?.square || '');
      if (scene?.isScene && targetSquare) {
        if (targetSquare !== cachedSquare) {
          cachedSquare = targetSquare;
          cachedTarget = squarePosition(targetSquare);
        }
        const remaining = Math.hypot(
          cachedTarget.x - group.position.x,
          cachedTarget.z - group.position.z,
        );
        if (remaining > MOVE_EPSILON) {
          if (!hasWarRoomMoveLightGuard(scene, group)) {
            armWarRoomMoveLightGuard({ scene, owner: group, targetSquare, target: cachedTarget });
          }
        } else if (hasWarRoomMoveLightGuard(scene, group)) {
          clearWarRoomMoveLightGuard(scene, group);
        }
      }
      previous?.apply(this, args);
    };
    wrapped += 1;
  });

  if (wrapped === 0) return group;

  const resetBodyMotion = group.userData.board3DResetBodyMotion;
  if (typeof resetBodyMotion === 'function') {
    group.userData.board3DResetBodyMotion = function resetBodyMotionWithLightRollback() {
      const scene = owningScene(group);
      if (scene) clearWarRoomMoveLightGuard(scene, group);
      return resetBodyMotion();
    };
  }

  group.userData.board3DMoveLightGuardProfile = 'reactive-light-rollback-v1';
  return group;
}

export function installPieceBodyMotion(group, type, options = {}) {
  return installMoveLightRollback(installPieceBodyMotionImpl(group, type, options));
}

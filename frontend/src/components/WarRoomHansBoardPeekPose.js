import * as THREE from 'three';
import {
  getWarRoomHansActor,
  getWarRoomHansNarrativePhase,
  setWarRoomHansRuntimeState,
} from './WarRoomHansActor.js';
import {
  HANS_WORKING_REPLY_MS,
  hansBoardPeekHoldsMovement,
} from './WarRoomHansFireCallContract.js';
import { registerWarRoomHansPostRenderStage } from './WarRoomHansPostRenderPipeline.js';

export const WAR_ROOM_HANS_BOARD_PEEK_POSE_VERSION = 'board-peek-pose-v4-safe-board-edge';
export const HANS_BOARD_PEEK_MAX_APPROACH_DISTANCE = 0.22;
export const HANS_BOARD_PEEK_MIN_BOARD_CENTER_DISTANCE = 4.85;

const POST_RENDER_ORDER = 21;
const BOARD_APPROACH_MS = 780;
const BOARD_RETURN_MS = 620;

function nowMs() {
  return typeof performance !== 'undefined' && typeof performance.now === 'function'
    ? performance.now()
    : Date.now();
}

function clamp01(value) {
  return Math.max(0, Math.min(1, Number(value) || 0));
}

function smoothstep01(value) {
  const t = clamp01(value);
  return t * t * (3 - 2 * t);
}

export function resolveHansBoardPeekApproachDistance({
  x,
  z,
  maxDistance = HANS_BOARD_PEEK_MAX_APPROACH_DISTANCE,
  minBoardCenterDistance = HANS_BOARD_PEEK_MIN_BOARD_CENTER_DISTANCE,
} = {}) {
  const px = Number(x);
  const pz = Number(z);
  const requested = Math.max(0, Number(maxDistance) || 0);
  const safeRadius = Math.max(0, Number(minBoardCenterDistance) || 0);
  if (!Number.isFinite(px) || !Number.isFinite(pz)) return 0;

  const radius = Math.hypot(px, pz);
  return Math.max(0, Math.min(requested, radius - safeRadius));
}

function capturePart(part) {
  if (!part?.position || !part?.rotation) return null;
  return {
    px: part.position.x,
    py: part.position.y,
    pz: part.position.z,
    rx: part.rotation.x,
    ry: part.rotation.y,
    rz: part.rotation.z,
  };
}

function restorePoseOffsets(body, bases) {
  if (body.leftArm && bases.leftArm) {
    body.leftArm.position.set(bases.leftArm.px, bases.leftArm.py, bases.leftArm.pz);
    body.leftArm.rotation.y = bases.leftArm.ry;
    body.leftArm.rotation.z = bases.leftArm.rz;
  }
  if (body.rightArm && bases.rightArm) {
    body.rightArm.position.set(bases.rightArm.px, bases.rightArm.py, bases.rightArm.pz);
    body.rightArm.rotation.y = bases.rightArm.ry;
    body.rightArm.rotation.z = bases.rightArm.rz;
  }
  if (body.torso && bases.torso) body.torso.position.z = bases.torso.pz;
  if (body.head && bases.head) body.head.position.z = bases.head.pz;
}

function approachAmount(phase, phaseElapsedMs) {
  if (phase === 'peek') return smoothstep01(phaseElapsedMs / BOARD_APPROACH_MS);
  if (phase === 'hans-working-reply') {
    const returnStart = Math.max(0, HANS_WORKING_REPLY_MS - BOARD_RETURN_MS);
    return 1 - smoothstep01((phaseElapsedMs - returnStart) / BOARD_RETURN_MS);
  }
  return 1;
}

export function installWarRoomHansBoardPeekPose(root) {
  const actor = getWarRoomHansActor(root);
  const hans = actor?.hans;
  const driver = actor?.driver;
  const body = actor?.body;
  if (!hans || !driver || !body || typeof driver.onBeforeRender !== 'function') return 0;
  if (driver.userData?.warRoomHansBoardPeekPose === WAR_ROOM_HANS_BOARD_PEEK_POSE_VERSION) return 0;

  const bases = {
    leftArm: capturePart(body.leftArm),
    rightArm: capturePart(body.rightArm),
    torso: capturePart(body.torso),
    head: capturePart(body.head),
  };
  const startWorld = new THREE.Vector3();
  const targetWorld = new THREE.Vector3();
  const currentWorld = new THREE.Vector3();
  const boardDirection = new THREE.Vector3();
  const localPosition = new THREE.Vector3();
  let active = false;
  let activePhase = '';
  let phaseStartedAt = 0;
  let safeApproachDistance = 0;

  const registered = registerWarRoomHansPostRenderStage(driver, {
    key: WAR_ROOM_HANS_BOARD_PEEK_POSE_VERSION,
    order: POST_RENDER_ORDER,
    run: () => {
      const narrativePhase = getWarRoomHansNarrativePhase(actor);
      if (!hans.visible || !hansBoardPeekHoldsMovement(narrativePhase)) {
        if (active) restorePoseOffsets(body, bases);
        active = false;
        activePhase = '';
        safeApproachDistance = 0;
        setWarRoomHansRuntimeState(actor, 'warRoomHansBoardPeekPoseActive', false);
        return;
      }

      const frameNow = nowMs();
      if (!active) {
        hans.parent?.updateMatrixWorld?.(true);
        hans.getWorldPosition(startWorld);
        targetWorld.copy(startWorld);
        boardDirection.set(-startWorld.x, 0, -startWorld.z);
        safeApproachDistance = resolveHansBoardPeekApproachDistance({
          x: startWorld.x,
          z: startWorld.z,
        });
        if (boardDirection.lengthSq() > 1e-8 && safeApproachDistance > 0) {
          boardDirection.normalize();
          targetWorld.addScaledVector(boardDirection, safeApproachDistance);
        }
        active = true;
        activePhase = narrativePhase;
        phaseStartedAt = frameNow;
      } else if (activePhase !== narrativePhase) {
        activePhase = narrativePhase;
        phaseStartedAt = frameNow;
      }

      const phaseElapsed = Math.max(0, frameNow - phaseStartedAt);
      const approach = approachAmount(narrativePhase, phaseElapsed);
      currentWorld.lerpVectors(startWorld, targetWorld, approach);
      localPosition.copy(currentWorld);
      hans.parent?.worldToLocal?.(localPosition);
      if (Number.isFinite(localPosition.x) && Number.isFinite(localPosition.z)) {
        hans.position.x = localPosition.x;
        hans.position.z = localPosition.z;
      }

      if (body.leftArm && bases.leftArm) {
        body.leftArm.position.set(bases.leftArm.px, bases.leftArm.py, bases.leftArm.pz - 0.035);
        body.leftArm.rotation.set(bases.leftArm.rx + 0.42, bases.leftArm.ry - 0.08, bases.leftArm.rz - 0.11);
      }
      if (body.rightArm && bases.rightArm) {
        body.rightArm.position.set(bases.rightArm.px, bases.rightArm.py, bases.rightArm.pz - 0.035);
        body.rightArm.rotation.set(bases.rightArm.rx + 0.42, bases.rightArm.ry + 0.08, bases.rightArm.rz + 0.11);
      }
      if (body.torso && bases.torso) {
        body.torso.position.z = bases.torso.pz + 0.018;
        body.torso.rotation.x = bases.torso.rx + 0.035;
      }
      if (body.head && bases.head) {
        body.head.position.z = bases.head.pz + 0.025;
        body.head.rotation.x = bases.head.rx + 0.05;
      }

      setWarRoomHansRuntimeState(actor, 'warRoomHansBoardPeekPoseActive', true);
      setWarRoomHansRuntimeState(actor, 'warRoomHansBoardPeekPose', WAR_ROOM_HANS_BOARD_PEEK_POSE_VERSION);
      setWarRoomHansRuntimeState(actor, 'warRoomHansBoardPeekHands', 'behind-back');
      setWarRoomHansRuntimeState(actor, 'warRoomHansBoardPeekApproach', 'board-center-safe-edge-v2');
      setWarRoomHansRuntimeState(actor, 'warRoomHansBoardPeekApproachAmount', approach);
      setWarRoomHansRuntimeState(actor, 'warRoomHansBoardPeekApproachDistance', safeApproachDistance);
    },
  });
  if (!registered) return 0;

  driver.userData.warRoomHansBoardPeekPose = WAR_ROOM_HANS_BOARD_PEEK_POSE_VERSION;
  driver.userData.warRoomHansBoardPeekApproachDistance = HANS_BOARD_PEEK_MAX_APPROACH_DISTANCE;
  driver.userData.warRoomHansBoardPeekMinBoardCenterDistance = HANS_BOARD_PEEK_MIN_BOARD_CENTER_DISTANCE;
  return 1;
}

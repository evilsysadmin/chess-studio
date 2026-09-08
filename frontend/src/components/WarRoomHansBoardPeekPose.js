import {
  getWarRoomHansActor,
  getWarRoomHansNarrativePhase,
  setWarRoomHansRuntimeState,
} from './WarRoomHansActor.js';
import { hansBoardPeekHoldsMovement } from './WarRoomHansFireCallContract.js';
import { registerWarRoomHansPostRenderStage } from './WarRoomHansPostRenderPipeline.js';

export const WAR_ROOM_HANS_BOARD_PEEK_POSE_VERSION = 'board-peek-pose-v2-actor-hands-behind-back';

const POST_RENDER_ORDER = 21;

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

export function installWarRoomHansBoardPeekPose(root) {
  const actor = getWarRoomHansActor(root);
  const hans = actor?.hans;
  const driver = actor?.driver;
  const body = actor?.body;
  if (!hans || !driver || !body || typeof driver.onBeforeRender !== 'function') return 0;
  if (driver.userData?.warRoomHansBoardPeekPose === WAR_ROOM_HANS_BOARD_PEEK_POSE_VERSION) return 0;

  const leftArmBase = capturePart(body.leftArm);
  const rightArmBase = capturePart(body.rightArm);
  const torsoBase = capturePart(body.torso);
  const headBase = capturePart(body.head);

  const registered = registerWarRoomHansPostRenderStage(driver, {
    key: WAR_ROOM_HANS_BOARD_PEEK_POSE_VERSION,
    order: POST_RENDER_ORDER,
    run: () => {
      const narrativePhase = getWarRoomHansNarrativePhase(actor);
      if (!hans.visible || !hansBoardPeekHoldsMovement(narrativePhase)) {
        setWarRoomHansRuntimeState(actor, 'warRoomHansBoardPeekPoseActive', false);
        return;
      }

      if (body.leftArm && leftArmBase) {
        body.leftArm.position.set(leftArmBase.px, leftArmBase.py, leftArmBase.pz - 0.035);
        body.leftArm.rotation.set(leftArmBase.rx + 0.42, leftArmBase.ry - 0.08, leftArmBase.rz - 0.11);
      }
      if (body.rightArm && rightArmBase) {
        body.rightArm.position.set(rightArmBase.px, rightArmBase.py, rightArmBase.pz - 0.035);
        body.rightArm.rotation.set(rightArmBase.rx + 0.42, rightArmBase.ry + 0.08, rightArmBase.rz + 0.11);
      }
      if (body.torso && torsoBase) {
        body.torso.position.z = torsoBase.pz + 0.018;
        body.torso.rotation.x = torsoBase.rx + 0.035;
      }
      if (body.head && headBase) {
        body.head.position.z = headBase.pz + 0.025;
        body.head.rotation.x = headBase.rx + 0.05;
      }

      setWarRoomHansRuntimeState(actor, 'warRoomHansBoardPeekPoseActive', true);
      setWarRoomHansRuntimeState(actor, 'warRoomHansBoardPeekPose', WAR_ROOM_HANS_BOARD_PEEK_POSE_VERSION);
      setWarRoomHansRuntimeState(actor, 'warRoomHansBoardPeekHands', 'behind-back');
    },
  });
  if (!registered) return 0;

  driver.userData.warRoomHansBoardPeekPose = WAR_ROOM_HANS_BOARD_PEEK_POSE_VERSION;
  return 1;
}
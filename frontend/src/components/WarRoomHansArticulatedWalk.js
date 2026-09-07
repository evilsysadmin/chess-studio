import {
  advanceHansWalkCycle,
  createHansWalkCycle,
  HANS_WALK_CYCLE_VERSION,
  resetHansWalkCycle,
} from './HansWalkCycle.js';
import { registerWarRoomHansPostRenderStage } from './WarRoomHansPostRenderPipeline.js';

export const WAR_ROOM_HANS_ARTICULATED_WALK_VERSION = 'war-room-hans-articulated-walk-v5-toe-forward-feet';

const HANS_NAME = 'war-room-hans-butler';
const DRIVER_NAME = 'war-room-hans-fireplace-driver';
const MIN_TRAVEL = 0.00004;
const MIN_TRAVEL_SQ = MIN_TRAVEL * MIN_TRAVEL;
const TELEPORT_DISTANCE = 0.48;
const TELEPORT_DISTANCE_SQ = TELEPORT_DISTANCE * TELEPORT_DISTANCE;
const HORIZONTAL_BLEND_RESPONSE = 0.36;
const WAR_ROOM_GAIT_CADENCE_GAIN = 1.14;
const VISIBLE_KNEE_THRESHOLD = 0.17;
const VISIBLE_KNEE_RANGE = 0.46;
const VISIBLE_KNEE_EXTRA_BASE = 0.85;
const VISIBLE_KNEE_EXTRA_HORIZONTAL = 0.2;
const VISIBLE_FOOT_LIFT_BASE = 0.055;
const VISIBLE_FOOT_LIFT_HORIZONTAL = 0.025;
const SHOE_TOE_UP_SWING = 0.06;
const LEGACY_ELDER_WALK_VERSION = 'elder-butler-gait-v1';
const LEGACY_GAIT_FRAME_COUNT = 8;
const POST_RENDER_ORDER = 24;

function clamp01(value) {
  return Math.max(0, Math.min(1, Number(value) || 0));
}

function smooth01(value) {
  const t = clamp01(value);
  return t * t * (3 - 2 * t);
}

function mix(a, b, t) {
  return a + (b - a) * t;
}

function walkingState(hans) {
  return String(hans?.userData?.warRoomHansMotionState || '').startsWith('walk');
}

function horizontalTravelWeight(dx, dz) {
  const ax = Math.abs(Number(dx) || 0);
  const az = Math.abs(Number(dz) || 0);
  const total = ax + az;
  if (total < MIN_TRAVEL) return 0;
  const share = ax / total;
  return smooth01((share - 0.35) / 0.5);
}

function inferForward(body) {
  const logZ = Number(body?.carriedLog?.position?.z);
  if (Number.isFinite(logZ) && Math.abs(logZ) > 0.0001) return Math.sign(logZ);
  const pokerZ = Number(body?.carriedPoker?.position?.z);
  if (Number.isFinite(pokerZ) && Math.abs(pokerZ) > 0.0001) return Math.sign(pokerZ);
  return 1;
}

function airborneAmount(kneeFlex) {
  return smooth01((Number(kneeFlex || 0) - VISIBLE_KNEE_THRESHOLD) / VISIBLE_KNEE_RANGE);
}

function keepShoeToeForward(body, bases, side, forward, airborne) {
  const leg = body?.[`${side}Leg`];
  const knee = body?.[`${side}Knee`];
  const shoe = body?.[`${side}Shoe`];
  const legBase = bases?.[`${side}Leg`];
  const kneeBase = bases?.[`${side}Knee`];
  const shoeBase = bases?.[`${side}Shoe`];
  if (!leg || !knee || !shoe || !legBase || !kneeBase || !shoeBase) return 0;

  // The shoe inherits pitch from both the upper leg and the knee. Compensate the
  // complete parent-chain pitch so its long axis keeps pointing in Hans's local
  // forward direction. Add only a tiny toe-up during swing for a natural pickup.
  const inheritedPitch = (leg.rotation.x - legBase.rx) + (knee.rotation.x - kneeBase.rx);
  const toeUp = clamp01(airborne) * SHOE_TOE_UP_SWING;
  shoe.rotation.x = shoeBase.rx - inheritedPitch - forward * toeUp;
  return toeUp;
}

function enforceVisibleKneeFlex(body, bases, sample, forward, horizontal) {
  const leftAir = airborneAmount(sample?.leftKnee);
  const rightAir = airborneAmount(sample?.rightKnee);
  const extraFlex = VISIBLE_KNEE_EXTRA_BASE + VISIBLE_KNEE_EXTRA_HORIZONTAL * horizontal;
  const extraLift = VISIBLE_FOOT_LIFT_BASE + VISIBLE_FOOT_LIFT_HORIZONTAL * horizontal;
  const leftExtraFlex = leftAir * extraFlex;
  const rightExtraFlex = rightAir * extraFlex;

  // War Room needs a little exaggeration to keep the knee readable at gameplay
  // scale, but the airborne leg should still look like a walking human leg rather
  // than a cartoon high-step. Keep the pickup broad and moderate.
  if (body?.leftKnee) body.leftKnee.rotation.x += forward * leftExtraFlex;
  if (body?.rightKnee) body.rightKnee.rotation.x += forward * rightExtraFlex;
  if (body?.leftLeg) body.leftLeg.position.y += leftAir * extraLift;
  if (body?.rightLeg) body.rightLeg.position.y += rightAir * extraLift;

  const leftToeUp = keepShoeToeForward(body, bases, 'left', forward, leftAir);
  const rightToeUp = keepShoeToeForward(body, bases, 'right', forward, rightAir);

  return {
    leftAir,
    rightAir,
    leftExtraFlex,
    rightExtraFlex,
    leftToeUp,
    rightToeUp,
  };
}

export function installWarRoomHansArticulatedWalk(root) {
  if (!root) return 0;
  const hans = root.getObjectByName?.(HANS_NAME);
  const driver = root.getObjectByName?.(DRIVER_NAME);
  const body = hans?.userData?.refs;
  if (!hans || !driver || !body || typeof driver.onBeforeRender !== 'function') return 0;
  if (driver.userData?.warRoomHansArticulatedWalk === WAR_ROOM_HANS_ARTICULATED_WALK_VERSION) return 0;

  const controller = createHansWalkCycle(body, { forward: inferForward(body) });
  if (!controller) return 0;

  let previousX = Number(hans.position?.x || 0);
  let previousZ = Number(hans.position?.z || 0);
  let horizontalBlend = 0;
  let realTravelDistance = 0;

  const registered = registerWarRoomHansPostRenderStage(driver, {
    key: WAR_ROOM_HANS_ARTICULATED_WALK_VERSION,
    order: POST_RENDER_ORDER,
    run: () => {
      const x = Number(hans.position?.x || 0);
      const z = Number(hans.position?.z || 0);
      const dx = x - previousX;
      const dz = z - previousZ;
      const travelSq = dx * dx + dz * dz;
      const isWalking = hans.visible && walkingState(hans);

      if (isWalking && travelSq > MIN_TRAVEL_SQ && travelSq <= TELEPORT_DISTANCE_SQ) {
        const travelled = Math.sqrt(travelSq);
        realTravelDistance += travelled;
        const targetHorizontal = horizontalTravelWeight(dx, dz);
        horizontalBlend = mix(horizontalBlend, targetHorizontal, HORIZONTAL_BLEND_RESPONSE);
        const sample = advanceHansWalkCycle(controller, {
          travelled: travelled * WAR_ROOM_GAIT_CADENCE_GAIN,
          horizontalWeight: horizontalBlend,
        });
        const visibleFlex = enforceVisibleKneeFlex(
          body,
          controller.bases,
          sample,
          controller.forward,
          horizontalBlend,
        );
        hans.userData.warRoomHansWalkCycle = HANS_WALK_CYCLE_VERSION;
        hans.userData.warRoomHansKneeFlexLeft = sample?.leftKnee ?? 0;
        hans.userData.warRoomHansKneeFlexRight = sample?.rightKnee ?? 0;
        hans.userData.warRoomHansVisibleKneeFlexLeft = visibleFlex.leftExtraFlex;
        hans.userData.warRoomHansVisibleKneeFlexRight = visibleFlex.rightExtraFlex;
        hans.userData.warRoomHansVisibleFootLiftLeft = visibleFlex.leftAir;
        hans.userData.warRoomHansVisibleFootLiftRight = visibleFlex.rightAir;
        hans.userData.warRoomHansToeUpLeft = visibleFlex.leftToeUp;
        hans.userData.warRoomHansToeUpRight = visibleFlex.rightToeUp;
        hans.userData.warRoomHansFootDirection = 'toe-forward-v2-parent-compensated';
        hans.userData.warRoomHansArticulatedWalk = WAR_ROOM_HANS_ARTICULATED_WALK_VERSION;
        hans.userData.warRoomHansArticulatedHorizontalBlend = horizontalBlend;
        hans.userData.warRoomHansLegRig = 'thigh-knee-shin-foot-v1';
        hans.userData.warRoomHansWalkCycleDistance = realTravelDistance;
        hans.userData.warRoomHansWalkCyclePhaseDistance = controller.distance;
        hans.userData.warRoomHansGaitDistance = realTravelDistance;
        hans.userData.warRoomHansGaitGrounding = 'real-distance-foot-plant-v3';
        hans.userData.warRoomHansGaitTeleportSuppressed = false;
      } else if (!isWalking || travelSq > TELEPORT_DISTANCE_SQ) {
        horizontalBlend = mix(horizontalBlend, 0, HORIZONTAL_BLEND_RESPONSE);
        resetHansWalkCycle(controller);
        if (travelSq > TELEPORT_DISTANCE_SQ) {
          hans.userData.warRoomHansArticulatedTeleportSuppressed = true;
          hans.userData.warRoomHansGaitTeleportSuppressed = true;
        }
      }

      previousX = x;
      previousZ = z;
    },
  });
  if (!registered) return 0;

  driver.userData.warRoomHansArticulatedWalk = WAR_ROOM_HANS_ARTICULATED_WALK_VERSION;
  driver.userData.warRoomHansWalkCycle = HANS_WALK_CYCLE_VERSION;
  driver.userData.warRoomHansLegRig = 'thigh-knee-shin-foot-v1';
  driver.userData.warRoomHansWalkCycleSource = 'reusable-distance-driven-balanced-flex-toe-forward-v5';
  driver.userData.warRoomHansElderWalk = LEGACY_ELDER_WALK_VERSION;
  driver.userData.warRoomHansGaitFrames = LEGACY_GAIT_FRAME_COUNT;
  hans.userData.warRoomHansElderWalk = LEGACY_ELDER_WALK_VERSION;
  hans.userData.warRoomHansArticulatedWalk = WAR_ROOM_HANS_ARTICULATED_WALK_VERSION;
  hans.userData.warRoomHansWalkCycle = HANS_WALK_CYCLE_VERSION;
  hans.userData.warRoomHansLegRig = 'thigh-knee-shin-foot-v1';
  return 1;
}

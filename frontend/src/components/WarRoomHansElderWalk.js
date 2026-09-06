import { registerWarRoomHansPostRenderStage } from './WarRoomHansPostRenderPipeline.js';

export const WAR_ROOM_HANS_ELDER_WALK_VERSION = 'elder-butler-gait-v2-layered';

const HANS_NAME = 'war-room-hans-butler';
const DRIVER_NAME = 'war-room-hans-fireplace-driver';
const GAIT_FRAME_COUNT = 8;
const GAIT_CYCLE_DISTANCE = 0.82;
const MAX_TRAVEL_PER_FRAME = 0.09;
const HUNCH_RADIANS = 0.046;
const FULL_GAIT_TRAVEL = 0.052;
const BLEND_RESPONSE = 0.38;
const POST_RENDER_ORDER = 20;

// MotionPolish owns the canonical locomotion. These eight authored poses are
// deliberately small additive corrections: weight transfer, asymmetry and a
// little upper-body lag. Hans should read as an elderly butler, not as two gait
// systems fighting for the same joints.
const GAIT_FRAMES = Object.freeze([
  { left: 0.018, right: -0.008, bob: -0.001, sway: -0.004, roll: -0.004, yaw: 0.003, arm: -0.018, nod: 0.003, surge: -0.002 },
  { left: 0.032, right: -0.004, bob: -0.006, sway: -0.008, roll: -0.006, yaw: 0.005, arm: -0.024, nod: 0.007, surge: -0.004 },
  { left: 0.014, right: 0.012, bob: -0.004, sway: -0.004, roll: -0.003, yaw: 0.003, arm: -0.010, nod: 0.005, surge: 0.001 },
  { left: -0.008, right: 0.026, bob: 0.001, sway: 0.003, roll: 0.003, yaw: -0.002, arm: 0.014, nod: 0.001, surge: 0.003 },
  { left: -0.008, right: 0.018, bob: -0.001, sway: 0.004, roll: 0.004, yaw: -0.003, arm: 0.018, nod: 0.003, surge: -0.002 },
  { left: -0.004, right: 0.032, bob: -0.006, sway: 0.008, roll: 0.006, yaw: -0.005, arm: 0.024, nod: 0.007, surge: -0.004 },
  { left: 0.012, right: 0.014, bob: -0.004, sway: 0.004, roll: 0.003, yaw: -0.003, arm: 0.010, nod: 0.005, surge: 0.001 },
  { left: 0.026, right: -0.008, bob: 0.001, sway: -0.003, roll: -0.003, yaw: 0.002, arm: -0.014, nod: 0.001, surge: 0.003 },
]);

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

function inferForward(body) {
  const logZ = Number(body?.carriedLog?.position?.z);
  if (Number.isFinite(logZ) && Math.abs(logZ) > 0.0001) return Math.sign(logZ);
  const pokerZ = Number(body?.carriedPoker?.position?.z);
  if (Number.isFinite(pokerZ) && Math.abs(pokerZ) > 0.0001) return Math.sign(pokerZ);
  return 1;
}

function gaitSample(distance) {
  const cycle = ((Number(distance) || 0) / GAIT_CYCLE_DISTANCE) % 1;
  const frameFloat = (cycle < 0 ? cycle + 1 : cycle) * GAIT_FRAME_COUNT;
  const index = Math.floor(frameFloat) % GAIT_FRAME_COUNT;
  const next = (index + 1) % GAIT_FRAME_COUNT;
  const t = smooth01(frameFloat - Math.floor(frameFloat));
  const a = GAIT_FRAMES[index];
  const b = GAIT_FRAMES[next];
  const result = { index };
  for (const key of ['left', 'right', 'bob', 'sway', 'roll', 'yaw', 'arm', 'nod', 'surge']) {
    result[key] = mix(a[key], b[key], t);
  }
  return result;
}

function walkingState(hans) {
  return String(hans?.userData?.warRoomHansMotionState || '').startsWith('walk');
}

function addElderGait(body, sample, headSample, forward, blend) {
  const amount = clamp01(blend);
  if (amount <= 0.0001) return;

  const left = body?.leftLeg;
  const right = body?.rightLeg;
  const torso = body?.torso;
  const head = body?.head;

  if (left) {
    left.rotation.x += sample.left * amount;
    left.rotation.z -= sample.sway * 0.55 * amount;
  }
  if (right) {
    right.rotation.x += sample.right * amount;
    right.rotation.z -= sample.sway * 0.55 * amount;
  }
  if (torso) {
    torso.position.x += sample.sway * amount;
    torso.position.y += sample.bob * amount;
    torso.position.z += forward * sample.surge * amount;
    torso.rotation.x += forward * (HUNCH_RADIANS + Math.abs(sample.bob) * 0.28) * amount;
    torso.rotation.y += sample.yaw * amount;
    torso.rotation.z += sample.roll * amount;
  }
  if (head) {
    head.position.x += headSample.sway * 0.34 * amount;
    head.position.y += sample.bob * 0.38 * amount;
    head.rotation.x += forward * (HUNCH_RADIANS * 0.30 + headSample.nod) * amount;
    head.rotation.y -= headSample.yaw * 0.62 * amount;
    head.rotation.z -= headSample.roll * 0.42 * amount;
  }

  const carrying = body?.carriedLog?.visible === true || body?.carriedPoker?.visible === true;
  if (!carrying) {
    if (body?.leftArm) body.leftArm.rotation.x -= sample.arm * amount;
    if (body?.rightArm) body.rightArm.rotation.x += sample.arm * 0.68 * amount;
  }
}

export function installWarRoomHansElderWalk(root) {
  if (!root) return 0;
  const hans = root.getObjectByName?.(HANS_NAME);
  const driver = root.getObjectByName?.(DRIVER_NAME);
  const body = hans?.userData?.refs;
  if (!hans || !driver || !body || typeof driver.onBeforeRender !== 'function') return 0;
  if (driver.userData?.warRoomHansElderWalk === WAR_ROOM_HANS_ELDER_WALK_VERSION) return 0;

  let gaitDistance = 0;
  let gaitBlend = 0;
  let previousX = Number(hans.position?.x || 0);
  let previousZ = Number(hans.position?.z || 0);

  const registered = registerWarRoomHansPostRenderStage(driver, {
    key: WAR_ROOM_HANS_ELDER_WALK_VERSION,
    order: POST_RENDER_ORDER,
    run: () => {
      const x = Number(hans.position?.x || 0);
      const z = Number(hans.position?.z || 0);
      const travelled = Math.hypot(x - previousX, z - previousZ);
      const walking = hans.visible && walkingState(hans);

      if (walking) {
        const clampedTravel = Math.min(travelled, MAX_TRAVEL_PER_FRAME);
        if (clampedTravel > 0.00004) gaitDistance += clampedTravel;
        const targetBlend = clamp01(clampedTravel / FULL_GAIT_TRAVEL);
        gaitBlend = mix(gaitBlend, targetBlend, BLEND_RESPONSE);

        if (gaitBlend > 0.015) {
          const sample = gaitSample(gaitDistance);
          // Half an authored phase of head lag adds neck inertia without turning
          // Hans into a dashboard bobblehead.
          const headSample = gaitSample(gaitDistance - GAIT_CYCLE_DISTANCE / 16);
          addElderGait(body, sample, headSample, inferForward(body), gaitBlend);
          hans.userData.warRoomHansGaitFrame = sample.index;
          hans.userData.warRoomHansGaitFrameCount = GAIT_FRAME_COUNT;
          hans.userData.warRoomHansGaitDistance = gaitDistance;
        }
      } else {
        // The base driver has already authored the exact take-log/place-log/
        // stoke/satisfied pose for this frame. Locomotion must disappear rather
        // than freezing the last walking micro-pose on top of that action.
        gaitBlend = 0;
        delete hans.userData.warRoomHansGaitFrame;
      }

      hans.userData.warRoomHansGaitBlend = gaitBlend;
      hans.userData.warRoomHansGaitStyle = 'elder-butler-layered-v2';
      hans.userData.warRoomHansHunchRadians = HUNCH_RADIANS;
      previousX = x;
      previousZ = z;
    },
  });
  if (!registered) return 0;

  driver.userData.warRoomHansElderWalk = WAR_ROOM_HANS_ELDER_WALK_VERSION;
  driver.userData.warRoomHansGaitFrames = GAIT_FRAME_COUNT;
  driver.userData.warRoomHansGaitStyle = 'elder-butler-layered-v2';
  driver.userData.warRoomHansGaitCadence = 'distance-weighted-blend-v2';
  driver.userData.warRoomHansLocomotionOwnership = 'motion-polish-primary-elder-additive-v2';
  hans.userData.warRoomHansElderWalk = WAR_ROOM_HANS_ELDER_WALK_VERSION;
  return 1;
}

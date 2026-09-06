import { registerWarRoomHansPostRenderStage } from './WarRoomHansPostRenderPipeline.js';

export const WAR_ROOM_HANS_ELDER_WALK_VERSION = 'elder-butler-gait-v1';

const HANS_NAME = 'war-room-hans-butler';
const DRIVER_NAME = 'war-room-hans-fireplace-driver';
const GAIT_FRAME_COUNT = 8;
// Keep the stride short enough to read as an elderly shuffle. More importantly,
// the gait now advances by the *actual* travelled distance instead of capping
// each render frame. That cap made low-FPS War Room frames translate Hans farther
// than his legs advanced, which looked exactly like levitation.
const GAIT_CYCLE_DISTANCE = 0.26;
const MIN_TRAVEL = 0.00004;
const MIN_TRAVEL_SQ = MIN_TRAVEL * MIN_TRAVEL;
const TELEPORT_DISTANCE = 0.48;
const TELEPORT_DISTANCE_SQ = TELEPORT_DISTANCE * TELEPORT_DISTANCE;
const HUNCH_RADIANS = 0.058;
const POST_RENDER_ORDER = 20;

// Eight authored phases with continuous interpolation. In addition to swing and
// lift, each leg gets a tiny longitudinal foot-plant offset: the loaded foot
// travels backwards under the translating body while the swing foot steps ahead.
// That gives the eye a stationary contact point instead of two legs riding a rail.
const GAIT_FRAMES = Object.freeze([
  { left: 0.170, right: -0.110, bob: -0.004, sway: -0.010, roll: -0.008, yaw: 0.008, arm: -0.045, nod: 0.005, leftLift: 0.000, rightLift: 0.025, leftStep: -0.058, rightStep: 0.055, caneSwing: -0.070, caneLift: 0.000 },
  { left: 0.130, right: -0.040, bob: -0.014, sway: -0.012, roll: -0.010, yaw: 0.010, arm: -0.034, nod: 0.012, leftLift: 0.000, rightLift: 0.038, leftStep: -0.040, rightStep: 0.080, caneSwing: -0.040, caneLift: 0.006 },
  { left: 0.050, right: 0.060, bob: -0.008, sway: -0.006, roll: -0.005, yaw: 0.005, arm: -0.015, nod: 0.008, leftLift: 0.004, rightLift: 0.030, leftStep: -0.015, rightStep: 0.052, caneSwing: 0.010, caneLift: 0.018 },
  { left: -0.060, right: 0.160, bob: -0.002, sway: 0.004, roll: 0.004, yaw: -0.004, arm: 0.024, nod: 0.002, leftLift: 0.022, rightLift: 0.000, leftStep: 0.045, rightStep: -0.032, caneSwing: 0.060, caneLift: 0.030 },
  { left: -0.110, right: 0.170, bob: -0.004, sway: 0.010, roll: 0.008, yaw: -0.008, arm: 0.045, nod: 0.005, leftLift: 0.028, rightLift: 0.000, leftStep: 0.058, rightStep: -0.058, caneSwing: 0.070, caneLift: 0.025 },
  { left: -0.040, right: 0.130, bob: -0.014, sway: 0.012, roll: 0.010, yaw: -0.010, arm: 0.034, nod: 0.012, leftLift: 0.038, rightLift: 0.000, leftStep: 0.080, rightStep: -0.040, caneSwing: 0.040, caneLift: 0.012 },
  { left: 0.060, right: 0.050, bob: -0.008, sway: 0.006, roll: 0.005, yaw: -0.005, arm: 0.015, nod: 0.008, leftLift: 0.030, rightLift: 0.004, leftStep: 0.052, rightStep: -0.015, caneSwing: -0.010, caneLift: 0.000 },
  { left: 0.160, right: -0.060, bob: -0.002, sway: -0.004, roll: -0.004, yaw: 0.004, arm: -0.024, nod: 0.002, leftLift: 0.000, rightLift: 0.022, leftStep: -0.032, rightStep: 0.045, caneSwing: -0.060, caneLift: 0.000 },
]);

const GAIT_SAMPLE_KEYS = Object.freeze([
  'left', 'right', 'bob', 'sway', 'roll', 'yaw', 'arm', 'nod',
  'leftLift', 'rightLift', 'leftStep', 'rightStep', 'caneSwing', 'caneLift',
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

function capturePart(part) {
  if (!part?.position || !part?.rotation) return null;
  return {
    x: part.position.x,
    y: part.position.y,
    z: part.position.z,
    rx: part.rotation.x,
    ry: part.rotation.y,
    rz: part.rotation.z,
  };
}

function restorePart(part, base) {
  if (!part || !base) return;
  part.position.set(base.x, base.y, base.z);
  part.rotation.set(base.rx, base.ry, base.rz);
}

function captureBases(body) {
  return {
    leftLeg: capturePart(body?.leftLeg),
    rightLeg: capturePart(body?.rightLeg),
    torso: capturePart(body?.torso),
    head: capturePart(body?.head),
    leftArm: capturePart(body?.leftArm),
    rightArm: capturePart(body?.rightArm),
    cane: capturePart(body?.cane),
    tailcoat: capturePart(body?.tailcoat),
  };
}

function inferForward(body) {
  const logZ = Number(body?.carriedLog?.position?.z);
  if (Number.isFinite(logZ) && Math.abs(logZ) > 0.0001) return Math.sign(logZ);
  const pokerZ = Number(body?.carriedPoker?.position?.z);
  if (Number.isFinite(pokerZ) && Math.abs(pokerZ) > 0.0001) return Math.sign(pokerZ);
  return 1;
}

function createGaitSample() {
  const sample = { index: 0 };
  for (const key of GAIT_SAMPLE_KEYS) sample[key] = 0;
  return sample;
}

function gaitSample(distance, result) {
  const cycle = ((Number(distance) || 0) / GAIT_CYCLE_DISTANCE) % 1;
  const frameFloat = (cycle < 0 ? cycle + 1 : cycle) * GAIT_FRAME_COUNT;
  const index = Math.floor(frameFloat) % GAIT_FRAME_COUNT;
  const next = (index + 1) % GAIT_FRAME_COUNT;
  const t = smooth01(frameFloat - Math.floor(frameFloat));
  const a = GAIT_FRAMES[index];
  const b = GAIT_FRAMES[next];
  result.index = index;
  for (const key of GAIT_SAMPLE_KEYS) result[key] = mix(a[key], b[key], t);
  return result;
}

function walkingState(hans) {
  return String(hans?.userData?.warRoomHansMotionState || '').startsWith('walk');
}

function applyAccessoryGait(body, bases, sample, forward, carrying) {
  const cane = body?.cane;
  if (cane && bases.cane) {
    cane.visible = !carrying;
    if (!carrying) {
      cane.position.set(
        bases.cane.x,
        bases.cane.y + sample.caneLift,
        bases.cane.z,
      );
      cane.rotation.x = bases.cane.rx + forward * sample.caneSwing;
      cane.rotation.y = bases.cane.ry;
      cane.rotation.z = bases.cane.rz - sample.sway * 1.15;
    }
  }

  const tailcoat = body?.tailcoat;
  if (tailcoat && bases.tailcoat) {
    tailcoat.position.set(bases.tailcoat.x, bases.tailcoat.y, bases.tailcoat.z);
    tailcoat.rotation.x = bases.tailcoat.rx - forward * sample.bob * 0.85;
    tailcoat.rotation.y = bases.tailcoat.ry - sample.yaw * 0.55;
    tailcoat.rotation.z = bases.tailcoat.rz - sample.roll * 0.28;
  }
}

function applyElderGait(body, bases, sample, headSample, forward) {
  const left = body?.leftLeg;
  const right = body?.rightLeg;
  const torso = body?.torso;
  const head = body?.head;

  if (left && bases.leftLeg) {
    left.position.y = bases.leftLeg.y + sample.leftLift;
    left.position.z = bases.leftLeg.z + forward * sample.leftStep;
    left.rotation.x = bases.leftLeg.rx + sample.left;
    left.rotation.z = bases.leftLeg.rz - sample.sway * 0.65;
  }
  if (right && bases.rightLeg) {
    right.position.y = bases.rightLeg.y + sample.rightLift;
    right.position.z = bases.rightLeg.z + forward * sample.rightStep;
    right.rotation.x = bases.rightLeg.rx + sample.right;
    right.rotation.z = bases.rightLeg.rz - sample.sway * 0.65;
  }
  if (torso && bases.torso) {
    torso.position.x = bases.torso.x + sample.sway;
    torso.position.y = bases.torso.y + sample.bob;
    torso.rotation.x = bases.torso.rx + forward * (HUNCH_RADIANS + Math.abs(sample.bob) * 0.35);
    torso.rotation.y = bases.torso.ry + sample.yaw;
    torso.rotation.z = bases.torso.rz + sample.roll;
  }
  if (head && bases.head) {
    head.position.x = bases.head.x + headSample.sway * 0.38;
    head.position.y = bases.head.y + sample.bob * 0.42;
    head.rotation.x = bases.head.rx + forward * (HUNCH_RADIANS * 0.36 + headSample.nod);
    head.rotation.y = bases.head.ry - headSample.yaw * 0.7;
    head.rotation.z = bases.head.rz - headSample.roll * 0.45;
  }

  const carryingLog = body?.carriedLog?.visible === true;
  const carryingPoker = body?.carriedPoker?.visible === true;
  const carrying = carryingLog || carryingPoker;
  if (carryingLog) {
    if (body?.leftArm && bases.leftArm) {
      body.leftArm.rotation.x = bases.leftArm.rx - 0.43;
      body.leftArm.rotation.z = bases.leftArm.rz + 0.035;
    }
    if (body?.rightArm && bases.rightArm) {
      body.rightArm.rotation.x = bases.rightArm.rx - 0.5;
      body.rightArm.rotation.z = bases.rightArm.rz - 0.025;
    }
  } else if (carryingPoker) {
    if (body?.leftArm && bases.leftArm) body.leftArm.rotation.x = bases.leftArm.rx - 0.12;
    if (body?.rightArm && bases.rightArm) body.rightArm.rotation.x = bases.rightArm.rx - 0.42;
  } else {
    if (body?.leftArm && bases.leftArm) body.leftArm.rotation.x = bases.leftArm.rx - sample.arm;
    if (body?.rightArm && bases.rightArm) body.rightArm.rotation.x = bases.rightArm.rx + sample.arm * 0.72;
  }
  applyAccessoryGait(body, bases, sample, forward, carrying);
}

export function installWarRoomHansElderWalk(root) {
  if (!root) return 0;
  const hans = root.getObjectByName?.(HANS_NAME);
  const driver = root.getObjectByName?.(DRIVER_NAME);
  const body = hans?.userData?.refs;
  if (!hans || !driver || !body || typeof driver.onBeforeRender !== 'function') return 0;
  if (driver.userData?.warRoomHansElderWalk === WAR_ROOM_HANS_ELDER_WALK_VERSION) return 0;

  const bases = captureBases(body);
  const sample = createGaitSample();
  const headSample = createGaitSample();
  let gaitDistance = 0;
  let previousX = Number(hans.position?.x || 0);
  let previousZ = Number(hans.position?.z || 0);

  const registered = registerWarRoomHansPostRenderStage(driver, {
    key: WAR_ROOM_HANS_ELDER_WALK_VERSION,
    order: POST_RENDER_ORDER,
    run: () => {
      const x = Number(hans.position?.x || 0);
      const z = Number(hans.position?.z || 0);
      const dx = x - previousX;
      const dz = z - previousZ;
      const travelSq = dx * dx + dz * dz;
      const carrying = body?.carriedLog?.visible === true || body?.carriedPoker?.visible === true;
      const ordinaryTravel = travelSq <= TELEPORT_DISTANCE_SQ;

      if (hans.visible && walkingState(hans) && travelSq > MIN_TRAVEL_SQ && ordinaryTravel) {
        // Full real travel is intentional. Never clamp ordinary frame travel:
        // doing so decouples gait speed from body speed exactly when FPS drops.
        const travelled = Math.sqrt(travelSq);
        gaitDistance += travelled;
        gaitSample(gaitDistance, sample);
        gaitSample(gaitDistance - GAIT_CYCLE_DISTANCE / 16, headSample);
        applyElderGait(body, bases, sample, headSample, inferForward(body));
        hans.userData.warRoomHansGaitFrame = sample.index;
        hans.userData.warRoomHansGaitFrameCount = GAIT_FRAME_COUNT;
        hans.userData.warRoomHansGaitDistance = gaitDistance;
        hans.userData.warRoomHansGaitStyle = 'elder-butler-weighted-v1';
        hans.userData.warRoomHansHunchRadians = HUNCH_RADIANS;
        hans.userData.warRoomHansGaitGrounding = 'real-distance-foot-plant-v3';
        hans.userData.warRoomHansGaitTeleportSuppressed = false;
        hans.userData.warRoomHansCaneCadence = body?.cane ? 'opposite-hand-support-v1' : null;
        hans.userData.warRoomHansGaitHotPath = 'preallocated-samples-v3-grounded';
      } else {
        restorePart(body?.cane, bases.cane);
        restorePart(body?.tailcoat, bases.tailcoat);
        if (body?.cane) body.cane.visible = !carrying;
        if (travelSq > TELEPORT_DISTANCE_SQ) hans.userData.warRoomHansGaitTeleportSuppressed = true;
      }

      previousX = x;
      previousZ = z;
    },
  });
  if (!registered) return 0;

  driver.userData.warRoomHansElderWalk = WAR_ROOM_HANS_ELDER_WALK_VERSION;
  driver.userData.warRoomHansGaitFrames = GAIT_FRAME_COUNT;
  driver.userData.warRoomHansGaitStyle = 'elder-butler-weighted-v1';
  driver.userData.warRoomHansGaitCadence = 'slow-weight-transfer-v1';
  driver.userData.warRoomHansGaitGrounding = 'real-distance-foot-plant-v3';
  driver.userData.warRoomHansCaneCadence = body?.cane ? 'opposite-hand-support-v1' : null;
  driver.userData.warRoomHansGaitHotPath = 'preallocated-samples-v3-grounded';
  hans.userData.warRoomHansElderWalk = WAR_ROOM_HANS_ELDER_WALK_VERSION;
  return 1;
}

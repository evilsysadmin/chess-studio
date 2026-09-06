export const WAR_ROOM_HANS_ELDER_WALK_VERSION = 'elder-butler-gait-v1';

const HANS_NAME = 'war-room-hans-butler';
const DRIVER_NAME = 'war-room-hans-fireplace-driver';
const GAIT_FRAME_COUNT = 8;
const GAIT_CYCLE_DISTANCE = 0.82;
const MAX_TRAVEL_PER_FRAME = 0.09;
const HUNCH_RADIANS = 0.052;

// Eight authored gait poses replace the old visual impression of a single
// sine-wave leg swap. Values stay deliberately restrained: Hans is an elderly
// butler carrying his weight carefully, not a cartoon hunchback or a sprinter.
const GAIT_FRAMES = Object.freeze([
  { left: 0.075, right: -0.035, bob: -0.002, sway: -0.006, roll: -0.006, yaw: 0.006, arm: -0.035, nod: 0.004 },
  { left: 0.095, right: -0.010, bob: -0.009, sway: -0.009, roll: -0.009, yaw: 0.008, arm: -0.028, nod: 0.010 },
  { left: 0.050, right: 0.025, bob: -0.005, sway: -0.004, roll: -0.004, yaw: 0.004, arm: -0.012, nod: 0.006 },
  { left: -0.020, right: 0.070, bob: 0.001, sway: 0.003, roll: 0.003, yaw: -0.003, arm: 0.020, nod: 0.001 },
  { left: -0.035, right: 0.075, bob: -0.002, sway: 0.006, roll: 0.006, yaw: -0.006, arm: 0.035, nod: 0.004 },
  { left: -0.010, right: 0.095, bob: -0.009, sway: 0.009, roll: 0.009, yaw: -0.008, arm: 0.028, nod: 0.010 },
  { left: 0.025, right: 0.050, bob: -0.005, sway: 0.004, roll: 0.004, yaw: -0.004, arm: 0.012, nod: 0.006 },
  { left: 0.070, right: -0.020, bob: 0.001, sway: -0.003, roll: -0.003, yaw: 0.003, arm: -0.020, nod: 0.001 },
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

function captureBases(body) {
  return {
    leftLeg: capturePart(body?.leftLeg),
    rightLeg: capturePart(body?.rightLeg),
    torso: capturePart(body?.torso),
    head: capturePart(body?.head),
    leftArm: capturePart(body?.leftArm),
    rightArm: capturePart(body?.rightArm),
  };
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
  // Ease inside each authored phase. Contact/load frames therefore linger a
  // fraction longer than the old perfect sine wave and read as actual weight.
  const t = smooth01(frameFloat - Math.floor(frameFloat));
  const a = GAIT_FRAMES[index];
  const b = GAIT_FRAMES[next];
  const result = { index };
  for (const key of ['left', 'right', 'bob', 'sway', 'roll', 'yaw', 'arm', 'nod']) {
    result[key] = mix(a[key], b[key], t);
  }
  return result;
}

function walkingState(hans) {
  return String(hans?.userData?.warRoomHansMotionState || '').startsWith('walk');
}

function applyElderGait(body, bases, sample, headSample, forward) {
  const left = body?.leftLeg;
  const right = body?.rightLeg;
  const torso = body?.torso;
  const head = body?.head;

  if (left && bases.leftLeg) {
    left.rotation.x = bases.leftLeg.rx + sample.left;
    left.rotation.z = bases.leftLeg.rz - sample.sway * 0.65;
  }
  if (right && bases.rightLeg) {
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
    // Head reacts slightly after the trunk: enough inertia to feel old/tired,
    // never enough to become bobble-head slapstick.
    head.rotation.x = bases.head.rx + forward * (HUNCH_RADIANS * 0.36 + headSample.nod);
    head.rotation.y = bases.head.ry - headSample.yaw * 0.7;
    head.rotation.z = bases.head.rz - headSample.roll * 0.45;
  }

  const carrying = body?.carriedLog?.visible === true || body?.carriedPoker?.visible === true;
  if (!carrying) {
    if (body?.leftArm && bases.leftArm) body.leftArm.rotation.x = bases.leftArm.rx - sample.arm;
    if (body?.rightArm && bases.rightArm) body.rightArm.rotation.x = bases.rightArm.rx + sample.arm * 0.72;
  }
}

export function installWarRoomHansElderWalk(root) {
  if (!root) return 0;
  const hans = root.getObjectByName?.(HANS_NAME);
  const driver = root.getObjectByName?.(DRIVER_NAME);
  const body = hans?.userData?.refs;
  if (!hans || !driver || !body || typeof driver.onBeforeRender !== 'function') return 0;
  if (driver.userData?.warRoomHansElderWalk === WAR_ROOM_HANS_ELDER_WALK_VERSION) return 0;

  const bases = captureBases(body);
  const original = driver.onBeforeRender;
  let gaitDistance = 0;
  let previousX = Number(hans.position?.x || 0);
  let previousZ = Number(hans.position?.z || 0);

  driver.onBeforeRender = (...args) => {
    original(...args);
    const x = Number(hans.position?.x || 0);
    const z = Number(hans.position?.z || 0);
    const travelled = Math.hypot(x - previousX, z - previousZ);

    if (hans.visible && walkingState(hans) && travelled > 0.00004) {
      gaitDistance += Math.min(travelled, MAX_TRAVEL_PER_FRAME);
      const sample = gaitSample(gaitDistance);
      // Roughly half an authored frame of lag for head inertia.
      const headSample = gaitSample(gaitDistance - GAIT_CYCLE_DISTANCE / 16);
      applyElderGait(body, bases, sample, headSample, inferForward(body));
      hans.userData.warRoomHansGaitFrame = sample.index;
      hans.userData.warRoomHansGaitFrameCount = GAIT_FRAME_COUNT;
      hans.userData.warRoomHansGaitDistance = gaitDistance;
      hans.userData.warRoomHansGaitStyle = 'elder-butler-weighted-v1';
      hans.userData.warRoomHansHunchRadians = HUNCH_RADIANS;
    }

    previousX = x;
    previousZ = z;
  };

  driver.userData.warRoomHansElderWalk = WAR_ROOM_HANS_ELDER_WALK_VERSION;
  driver.userData.warRoomHansGaitFrames = GAIT_FRAME_COUNT;
  driver.userData.warRoomHansGaitStyle = 'elder-butler-weighted-v1';
  driver.userData.warRoomHansGaitCadence = 'slow-weight-transfer-v1';
  hans.userData.warRoomHansElderWalk = WAR_ROOM_HANS_ELDER_WALK_VERSION;
  return 1;
}

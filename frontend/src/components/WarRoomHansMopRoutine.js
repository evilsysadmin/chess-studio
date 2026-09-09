import * as THREE from 'three';
import {
  acquireWarRoomHansRoutine,
  getWarRoomHansActor,
  getWarRoomHansCanvas,
  getWarRoomHansGameId,
  releaseWarRoomHansRoutine,
  warRoomHansRoutineAvailable,
} from './WarRoomHansActor.js';
import {
  warRoomHansAmbientDelayMs,
  warRoomHansEventMatches,
} from './WarRoomHansEventContract.js';
import {
  HANS_MOP_WALK_SPEED,
  WAR_ROOM_HANS_MOP_ROUTINE_VERSION,
  hansMopDialoguePhase,
  hansMopFatigueMs,
  hansMopPatchMs,
  shouldHansMopDialogue,
} from './WarRoomHansMopContract.js';
import { warRoomHansSafeRoomLoop } from './WarRoomHansNavigation.js';
import {
  HANS_SERVICE_WALK_SPEED,
  moveWarRoomHansToward,
  setWarRoomHansServiceDoor,
  warRoomHansServiceHome,
} from './WarRoomHansServiceRoute.js';
import {
  advanceHansWalkCycle,
  createHansWalkCycle,
  resetHansWalkCycle,
} from './HansWalkCycle.js';

const FLOOR_NAME = 'war-room-castle-floor-slab';
const ROUTINE_NAME = 'mop-room';

function makeBucket() {
  const group = new THREE.Group();
  group.name = 'war-room-hans-mop-bucket';
  const metal = new THREE.MeshPhysicalMaterial({ color: 0x6f7479, metalness: 0.55, roughness: 0.48 });
  const dark = new THREE.MeshPhysicalMaterial({ color: 0x25292d, metalness: 0.15, roughness: 0.72 });
  const bucket = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.18, 0.32, 12, 1, true), metal);
  bucket.position.y = 0.17;
  bucket.castShadow = true;
  bucket.receiveShadow = true;
  group.add(bucket);
  const rim = new THREE.Mesh(new THREE.TorusGeometry(0.215, 0.018, 6, 16), dark);
  rim.rotation.x = Math.PI / 2;
  rim.position.y = 0.33;
  group.add(rim);
  group.position.set(0.38, 0, -0.18);
  return group;
}

function makeMop() {
  const group = new THREE.Group();
  group.name = 'war-room-hans-mop';
  const wood = new THREE.MeshPhysicalMaterial({ color: 0x7a5230, roughness: 0.72 });
  const cloth = new THREE.MeshPhysicalMaterial({ color: 0xb8b3a7, roughness: 0.95 });
  const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 1.7, 8), wood);
  stick.position.y = 0.86;
  stick.rotation.z = -0.16;
  stick.castShadow = true;
  group.add(stick);
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.07, 0.18), cloth);
  head.position.set(0.14, 0.03, 0.02);
  head.castShadow = true;
  head.receiveShadow = true;
  group.add(head);
  group.position.set(-0.34, 0, 0.12);
  return group;
}

function ensureProps(actor) {
  let bucket = actor.hans.getObjectByName?.('war-room-hans-mop-bucket');
  let mop = actor.hans.getObjectByName?.('war-room-hans-mop');
  if (!bucket) { bucket = makeBucket(); actor.hans.add(bucket); }
  if (!mop) { mop = makeMop(); actor.hans.add(mop); }
  bucket.visible = false;
  mop.visible = false;
  return { bucket, mop };
}

function buildRoomWaypoints(floor, parent) {
  return warRoomHansSafeRoomLoop(floor, parent);
}

function setDialogue(actor, value) {
  const canvas = getWarRoomHansCanvas(actor);
  if (canvas?.dataset) canvas.dataset.warRoomHansMopDialogue = value || '';
}

function clearRoutineState(actor, props, controller, root) {
  resetHansWalkCycle(controller, { full: true });
  actor.hans.visible = false;
  actor.hans.userData.warRoomHansMotionState = 'idle';
  actor.hans.userData.warRoomHansRoute = '';
  actor.hans.userData.warRoomHansMopState = 'done';
  actor.driver.userData.warRoomHansPhase = 'idle';
  props.bucket.visible = false;
  props.mop.visible = false;
  setDialogue(actor, '');
  setWarRoomHansServiceDoor(root, 0);
  releaseWarRoomHansRoutine(actor, ROUTINE_NAME);
}

export function installWarRoomHansMopRoutine(root) {
  const actor = getWarRoomHansActor(root);
  const floor = root?.getObjectByName?.(FLOOR_NAME);
  if (!actor || !floor || typeof floor.onBeforeRender !== 'function') return 0;
  if (floor.userData?.warRoomHansMopRoutine === WAR_ROOM_HANS_MOP_ROUTINE_VERSION) return 0;

  const previous = floor.onBeforeRender;
  const props = ensureProps(actor);
  const controller = createHansWalkCycle(actor.body, { forward: 1 });
  if (!controller) return 0;

  let gameId = '';
  let delayMs = 0;
  let eligibleSince = 0;
  let completedGameId = '';
  let active = false;
  let fatigueMs = 0;
  let activeElapsedMs = 0;
  let patchRemainingMs = 0;
  let waypointIndex = 0;
  let waypoints = [];
  let home = null;
  let state = 'idle';
  let lastNow = null;
  let dialogueEnabled = false;
  let dialogueStarted = false;
  let dialogueElapsedMs = 0;

  floor.onBeforeRender = (...args) => {
    previous?.(...args);
    const now = typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now();
    const delta = lastNow == null ? 0 : Math.max(0, Math.min(250, now - lastNow));
    lastNow = now;

    const nextGameId = getWarRoomHansGameId(actor);
    if (!nextGameId) return;
    if (nextGameId !== gameId) {
      if (active) clearRoutineState(actor, props, controller, root);
      gameId = nextGameId;
      eligibleSince = now;
      delayMs = warRoomHansAmbientDelayMs(gameId, { min: 18000, max: 46000, salt: 'mop' });
      active = false;
      state = 'idle';
      fatigueMs = 0;
      activeElapsedMs = 0;
      patchRemainingMs = 0;
      waypointIndex = 0;
      waypoints = [];
      home = null;
      dialogueEnabled = false;
      dialogueStarted = false;
      dialogueElapsedMs = 0;
      setDialogue(actor, '');
    }
    if (!warRoomHansEventMatches(gameId, 'mop') || completedGameId === gameId) return;

    if (!active) {
      if (!warRoomHansRoutineAvailable(actor, ROUTINE_NAME) || now - eligibleSince < delayMs) return;
      if (!acquireWarRoomHansRoutine(actor, ROUTINE_NAME)) return;
      const service = warRoomHansServiceHome(root, actor.hans.parent);
      if (!service?.point) { releaseWarRoomHansRoutine(actor, ROUTINE_NAME); return; }
      home = service.point;
      actor.hans.position.copy(home);
      actor.hans.visible = true;
      setWarRoomHansServiceDoor(root, 1);
      active = true;
      fatigueMs = hansMopFatigueMs();
      activeElapsedMs = 0;
      waypoints = buildRoomWaypoints(floor, actor.hans.parent);
      if (!waypoints.length) {
        clearRoutineState(actor, props, controller, root);
        active = false;
        completedGameId = gameId;
        return;
      }
      waypointIndex = Math.floor(Math.random() * waypoints.length);
      state = 'walking';
      dialogueEnabled = shouldHansMopDialogue();
      props.bucket.visible = true;
      props.mop.visible = true;
      actor.hans.userData.warRoomHansMopState = state;
      actor.hans.userData.warRoomHansMopFatigueMs = fatigueMs;
      actor.hans.userData.warRoomHansMopNavigation = 'safe-room-loop-v1';
      actor.driver.userData.warRoomHansPhase = 'ambient-mop';
    }

    activeElapsedMs += delta;
    setWarRoomHansServiceDoor(root, Math.max(0, 1 - Math.min(1, activeElapsedMs / 1400)));
    if (dialogueStarted) {
      dialogueElapsedMs += delta;
      setDialogue(actor, hansMopDialoguePhase(dialogueElapsedMs));
    }

    if (state === 'walking') {
      const target = waypoints[waypointIndex];
      const motion = moveWarRoomHansToward(actor.hans, target, Math.max(HANS_MOP_WALK_SPEED, HANS_SERVICE_WALK_SPEED) * delta / 1000);
      actor.hans.userData.warRoomHansMotionState = 'walk-mop';
      actor.hans.userData.warRoomHansRoute = 'mop-room';
      actor.hans.userData.warRoomHansMopState = 'walking';
      props.mop.rotation.z = -0.12;
      props.mop.rotation.x = 0.08;
      props.bucket.position.y = 0.16;
      props.bucket.position.x = 0.38 + Math.sin(now * 0.004) * 0.02;
      if (motion.travelled > 0) advanceHansWalkCycle(controller, { travelled: motion.travelled, horizontalWeight: 0.45 });
      if (motion.arrived) {
        state = 'mopping';
        patchRemainingMs = hansMopPatchMs();
        resetHansWalkCycle(controller, { full: true });
        props.bucket.position.y = 0;
        if (dialogueEnabled && !dialogueStarted) {
          dialogueStarted = true;
          dialogueElapsedMs = 0;
          setDialogue(actor, 'matthias');
        }
      }
      return;
    }

    if (state === 'mopping') {
      patchRemainingMs -= delta;
      actor.hans.userData.warRoomHansMotionState = 'mop';
      actor.hans.userData.warRoomHansRoute = 'mop-room';
      actor.hans.userData.warRoomHansMopState = 'mopping';
      resetHansWalkCycle(controller, { full: true });
      const sweep = Math.sin(now * 0.0055);
      props.mop.rotation.z = -0.14 + sweep * 0.24;
      props.mop.position.x = -0.34 + sweep * 0.16;
      props.bucket.position.x = 0.40 + Math.sin(now * 0.002) * 0.025;
      if (actor.body.leftArm) actor.body.leftArm.rotation.x -= 0.52;
      if (actor.body.rightArm) actor.body.rightArm.rotation.x -= 0.72;
      if (actor.body.torso) actor.body.torso.rotation.x += 0.04;
      if (patchRemainingMs <= 0) {
        if (activeElapsedMs >= fatigueMs) state = 'returning';
        else {
          waypointIndex = (waypointIndex + 1 + Math.floor(Math.random() * 3)) % waypoints.length;
          state = 'walking';
        }
      }
      return;
    }

    if (state === 'returning') {
      const motion = moveWarRoomHansToward(actor.hans, home, HANS_SERVICE_WALK_SPEED * delta / 1000);
      actor.hans.userData.warRoomHansMotionState = 'walk-mop';
      actor.hans.userData.warRoomHansRoute = 'mop-return';
      actor.hans.userData.warRoomHansMopState = 'returning';
      if (motion.travelled > 0) advanceHansWalkCycle(controller, { travelled: motion.travelled, horizontalWeight: 0.45 });
      if (motion.arrived) {
        clearRoutineState(actor, props, controller, root);
        active = false;
        state = 'done';
        completedGameId = gameId;
      }
    }
  };

  floor.userData.warRoomHansMopRoutine = WAR_ROOM_HANS_MOP_ROUTINE_VERSION;
  actor.hans.userData.warRoomHansMopRoutine = WAR_ROOM_HANS_MOP_ROUTINE_VERSION;
  return 1;
}

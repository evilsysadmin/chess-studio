import * as THREE from 'three';
import {
  getWarRoomHansActor,
  getWarRoomHansCanvas,
  getWarRoomHansGameId,
} from './WarRoomHansActor.js';
import {
  advanceWarRoomHansWalk,
  applyWarRoomHansTaskPose,
  createWarRoomHansWalkController,
  placeWarRoomHansHorizontal,
  resetWarRoomHansWalk,
} from './WarRoomHansAnimator.js';
import {
  warRoomHansAmbientDelayMs,
  warRoomHansEventForGame,
} from './WarRoomHansEventContract.js';
import {
  WAR_ROOM_HANS_CHORE_EVENTS,
  warRoomHansChoreDialoguePhase,
  warRoomHansChoreForEvent,
} from './WarRoomHansChoreContract.js';
import {
  warRoomHansBuildSafeRoute,
  moveWarRoomHansAlongRoute,
} from './WarRoomHansNavigation.js';
import {
  assignWarRoomHansTask,
  getWarRoomHansRuntime,
  releaseWarRoomHansTask,
  setWarRoomHansTaskPhase,
  setWarRoomHansTaskPresentation,
  warRoomHansTaskAvailable,
} from './WarRoomHansRuntime.js';
import {
  HANS_SERVICE_WALK_SPEED,
  setWarRoomHansServiceDoor,
  warRoomHansServiceHome,
  warRoomHansTargetNearObject,
} from './WarRoomHansServiceRoute.js';

export const WAR_ROOM_HANS_AMBIENT_CHORE_ROUTINE_VERSION = 'hans-ambient-chore-v4-runtime-task';

const FLOOR_NAME = 'war-room-castle-floor-slab';
const CHORE_EVENTS = new Set(WAR_ROOM_HANS_CHORE_EVENTS);

function firstNamed(root, names = []) {
  for (const name of names) {
    const object = root?.getObjectByName?.(name);
    if (object) return object;
  }
  return null;
}

function material(color, options = {}) {
  return new THREE.MeshPhysicalMaterial({ color, roughness: 0.7, ...options });
}

function makeDuster() {
  const group = new THREE.Group();
  const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.82, 8), material(0x7b4e2d));
  handle.rotation.z = 0.35;
  handle.position.y = 0.38;
  group.add(handle);
  const plume = new THREE.Mesh(new THREE.SphereGeometry(0.16, 10, 7), material(0xaaa69c));
  plume.scale.set(1.4, 0.65, 0.75);
  plume.position.set(-0.13, 0.75, 0);
  group.add(plume);
  return group;
}

function makeBook() {
  const group = new THREE.Group();
  const cover = material(0x5d1f26, { clearcoat: 0.12 });
  const pages = material(0xd8caa8, { roughness: 0.9 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.08, 0.26), pages);
  group.add(body);
  const top = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.025, 0.28), cover);
  top.position.y = 0.055;
  group.add(top);
  const bottom = top.clone();
  bottom.position.y = -0.055;
  group.add(bottom);
  return group;
}

function makeLetters() {
  const group = new THREE.Group();
  const paper = material(0xd8ceb8, { roughness: 0.95 });
  for (let index = 0; index < 3; index += 1) {
    const letter = new THREE.Mesh(new THREE.BoxGeometry(0.31, 0.012, 0.19), paper);
    letter.position.set(index * 0.018, index * 0.012, -index * 0.012);
    letter.rotation.y = index * 0.06;
    group.add(letter);
  }
  return group;
}

function makeCloth() {
  const cloth = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.025, 0.18), material(0xa28b6b, { roughness: 0.98 }));
  cloth.rotation.z = 0.12;
  return cloth;
}

function makeAshBrush() {
  const group = new THREE.Group();
  const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.65, 8), material(0x684329));
  handle.rotation.z = -0.6;
  handle.position.y = 0.32;
  group.add(handle);
  const brush = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.09, 0.12), material(0x4a4038));
  brush.position.set(0.18, 0.05, 0);
  group.add(brush);
  return group;
}

function makeProp(kind) {
  if (kind === 'duster') return makeDuster();
  if (kind === 'book') return makeBook();
  if (kind === 'letters') return makeLetters();
  if (kind === 'cloth') return makeCloth();
  if (kind === 'ash-brush') return makeAshBrush();
  return null;
}

function ensureProp(actor, kind) {
  if (!kind) return null;
  const name = `war-room-hans-chore-prop-${kind}`;
  let prop = actor.hans.getObjectByName?.(name);
  if (!prop) {
    prop = makeProp(kind);
    if (!prop) return null;
    prop.name = name;
    prop.position.set(0.35, 0.75, 0.22);
    actor.hans.add(prop);
  }
  prop.visible = false;
  return prop;
}

function ensureDeliveredProp(root, eventName, targetObject) {
  if (!targetObject || !['bring-book', 'mail'].includes(eventName)) return null;
  const name = `war-room-hans-delivered-${eventName}`;
  const existing = root.getObjectByName?.(name);
  if (existing) return existing;
  const group = makeProp(eventName === 'bring-book' ? 'book' : 'letters');
  if (!group) return null;
  group.name = name;
  const deskTopY = Number(targetObject.position?.y || 1.03);
  const surfaceY = deskTopY + (eventName === 'bring-book' ? 0.12 : 0.095);
  group.position.set(
    eventName === 'bring-book' ? 0.55 : 0.95,
    surfaceY,
    eventName === 'bring-book' ? 0.14 : -0.12,
  );
  group.visible = false;
  (targetObject.parent || root).add(group);
  return group;
}

function setDialogue(actor, phase) {
  const canvas = getWarRoomHansCanvas(actor);
  if (canvas?.dataset) canvas.dataset.warRoomHansServiceDialogue = phase || '';
}

function restoreAdjustedTarget(targetObject, baseRotation) {
  if (!targetObject || baseRotation == null) return;
  targetObject.rotation.y = baseRotation;
}

function applyChoreEnvironment(eventName, elapsedMs, targetObject, baseRotation) {
  if (eventName !== 'straighten-room' || !targetObject || baseRotation == null) return;
  targetObject.rotation.y = baseRotation + Math.sin(Math.min(1, elapsedMs / 2200) * Math.PI) * 0.035;
}

function finish(actor, prop, controller, root, runtime, taskId, targetObject, baseRotation) {
  resetWarRoomHansWalk(controller, { full: true });
  restoreAdjustedTarget(targetObject, baseRotation);
  setWarRoomHansTaskPhase(runtime, 'idle');
  setWarRoomHansTaskPresentation(runtime, {
    visible: false,
    motionState: 'idle',
    route: '',
  });
  if (prop) prop.visible = false;
  setDialogue(actor, '');
  setWarRoomHansServiceDoor(root, 0);
  releaseWarRoomHansTask(runtime, taskId);
}

export function installWarRoomHansAmbientChoreRoutine(root) {
  const actor = getWarRoomHansActor(root);
  const floor = root?.getObjectByName?.(FLOOR_NAME);
  if (!actor || !floor || typeof floor.onBeforeRender !== 'function') return 0;
  if (floor.userData?.warRoomHansAmbientChoreRoutine === WAR_ROOM_HANS_AMBIENT_CHORE_ROUTINE_VERSION) return 0;

  const runtime = getWarRoomHansRuntime(actor);
  const previous = floor.onBeforeRender;
  const controller = createWarRoomHansWalkController(actor, { forward: 1 });
  if (!runtime || !controller) return 0;

  let gameId = '';
  let eventName = '';
  let eligibleSince = 0;
  let delayMs = 0;
  let completedGameId = '';
  let active = false;
  let state = 'idle';
  let home = null;
  let target = null;
  let targetObject = null;
  let targetBaseRotation = null;
  let prop = null;
  let deliveredProp = null;
  let routeIn = [];
  let routeOut = [];
  let routeIndex = 0;
  let actionElapsed = 0;
  let lastNow = null;
  let chore = null;

  floor.onBeforeRender = (...args) => {
    previous?.(...args);
    const now = typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now();
    const delta = lastNow == null ? 0 : Math.max(0, Math.min(250, now - lastNow));
    lastNow = now;

    const nextGameId = getWarRoomHansGameId(actor);
    if (!nextGameId) return;
    if (nextGameId !== gameId) {
      if (active && eventName) {
        finish(actor, prop, controller, root, runtime, `chore-${eventName}`, targetObject, targetBaseRotation);
      }
      gameId = nextGameId;
      eventName = warRoomHansEventForGame(gameId);
      eligibleSince = now;
      delayMs = warRoomHansAmbientDelayMs(gameId, { min: 22000, max: 62000, salt: `chore:${eventName}` });
      active = false;
      state = 'idle';
      home = null;
      target = null;
      targetObject = null;
      targetBaseRotation = null;
      prop = null;
      deliveredProp = null;
      routeIn = [];
      routeOut = [];
      routeIndex = 0;
      actionElapsed = 0;
      chore = null;
      setDialogue(actor, '');
      for (const name of ['bring-book', 'mail']) {
        const delivered = root.getObjectByName?.(`war-room-hans-delivered-${name}`);
        if (delivered) delivered.visible = false;
      }
    }

    if (!CHORE_EVENTS.has(eventName) || completedGameId === gameId) return;
    const taskId = `chore-${eventName}`;

    if (!active) {
      if (!warRoomHansTaskAvailable(runtime, taskId) || now - eligibleSince < delayMs) return;
      chore = warRoomHansChoreForEvent(eventName);
      if (!chore || !assignWarRoomHansTask(runtime, {
        id: taskId,
        kind: 'chore',
        source: 'WarRoomHansAmbientChoreRoutine',
        payload: { eventName },
      })) return;
      const service = warRoomHansServiceHome(root, actor.hans.parent);
      targetObject = firstNamed(root, chore.targetNames);
      if (!service?.point || !targetObject) {
        releaseWarRoomHansTask(runtime, taskId);
        return;
      }
      home = service.point;
      target = warRoomHansTargetNearObject(targetObject, actor.hans.parent, { offsetX: chore.offsetX, offsetZ: chore.offsetZ });
      if (!target) {
        releaseWarRoomHansTask(runtime, taskId);
        return;
      }
      routeIn = warRoomHansBuildSafeRoute(floor, actor.hans.parent, home, target);
      routeOut = warRoomHansBuildSafeRoute(floor, actor.hans.parent, target, home);
      if (!routeIn.length || !routeOut.length) {
        releaseWarRoomHansTask(runtime, taskId);
        return;
      }
      prop = ensureProp(actor, chore.prop);
      deliveredProp = ensureDeliveredProp(root, eventName, targetObject);
      if (deliveredProp) deliveredProp.visible = false;
      placeWarRoomHansHorizontal(actor, home);
      setWarRoomHansTaskPresentation(runtime, {
        visible: true,
        motionState: 'walk-chore',
        route: `chore-${eventName}`,
      });
      setWarRoomHansTaskPhase(runtime, 'walking-in');
      if (prop) prop.visible = true;
      setWarRoomHansServiceDoor(root, 1);
      targetBaseRotation = Number(targetObject.rotation?.y);
      state = 'walking-in';
      active = true;
      actionElapsed = 0;
      routeIndex = 0;
      actor.hans.userData.warRoomHansChoreEvent = eventName;
    }

    if (state === 'walking-in') {
      actionElapsed += delta;
      setWarRoomHansServiceDoor(root, Math.max(0, 1 - Math.min(1, actionElapsed / 1300)));
      const motion = moveWarRoomHansAlongRoute(actor.hans, routeIn, routeIndex, HANS_SERVICE_WALK_SPEED * delta / 1000);
      routeIndex = motion.index;
      setWarRoomHansTaskPresentation(runtime, {
        motionState: 'walk-chore',
        route: `chore-${eventName}`,
      });
      if (!motion.valid) {
        finish(actor, prop, controller, root, runtime, taskId, targetObject, targetBaseRotation);
        active = false;
        completedGameId = gameId;
        return;
      }
      if (motion.travelled > 0) {
        advanceWarRoomHansWalk(controller, { travelled: motion.travelled, horizontalWeight: 0.42 });
      }
      if (motion.arrived) {
        resetWarRoomHansWalk(controller, { full: true });
        state = 'acting';
        setWarRoomHansTaskPhase(runtime, 'acting');
        actionElapsed = 0;
      }
      return;
    }

    if (state === 'acting') {
      actionElapsed += delta;
      resetWarRoomHansWalk(controller, { full: true });
      setWarRoomHansTaskPresentation(runtime, {
        motionState: eventName,
        route: `chore-${eventName}`,
      });
      setDialogue(actor, warRoomHansChoreDialoguePhase(eventName, actionElapsed));
      applyWarRoomHansTaskPose(actor, eventName, { elapsedMs: actionElapsed });
      applyChoreEnvironment(eventName, actionElapsed, targetObject, targetBaseRotation);

      if (deliveredProp && actionElapsed >= Math.min(2600, chore.actionMs * 0.35)) {
        deliveredProp.visible = true;
        if (prop) prop.visible = false;
      }

      if (actionElapsed >= chore.actionMs) {
        restoreAdjustedTarget(targetObject, targetBaseRotation);
        setDialogue(actor, '');
        state = 'returning';
        setWarRoomHansTaskPhase(runtime, 'returning');
        routeIndex = 0;
        actionElapsed = 0;
      }
      return;
    }

    if (state === 'returning') {
      const motion = moveWarRoomHansAlongRoute(actor.hans, routeOut, routeIndex, HANS_SERVICE_WALK_SPEED * delta / 1000);
      routeIndex = motion.index;
      setWarRoomHansTaskPresentation(runtime, {
        motionState: 'walk-chore',
        route: 'chore-return',
      });
      if (!motion.valid) {
        finish(actor, prop, controller, root, runtime, taskId, targetObject, targetBaseRotation);
        active = false;
        completedGameId = gameId;
        return;
      }
      if (motion.travelled > 0) {
        advanceWarRoomHansWalk(controller, { travelled: motion.travelled, horizontalWeight: 0.42 });
      }
      if (motion.arrived) {
        finish(actor, prop, controller, root, runtime, taskId, targetObject, targetBaseRotation);
        active = false;
        state = 'done';
        completedGameId = gameId;
      }
    }
  };

  floor.userData.warRoomHansAmbientChoreRoutine = WAR_ROOM_HANS_AMBIENT_CHORE_ROUTINE_VERSION;
  return 1;
}

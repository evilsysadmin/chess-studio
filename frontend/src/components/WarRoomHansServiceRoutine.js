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
import { ensureWarRoomHansPlant } from './WarRoomHansPlantDecor.js';
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
  warRoomHansServiceActionMs,
  warRoomHansServiceDialoguePhase,
} from './WarRoomHansServiceContract.js';
import {
  HANS_SERVICE_WALK_SPEED,
  setWarRoomHansServiceDoor,
  warRoomHansServiceHome,
  warRoomHansTargetNearObject,
} from './WarRoomHansServiceRoute.js';

export const WAR_ROOM_HANS_SERVICE_ROUTINE_VERSION = 'hans-service-routine-v5-runtime-task';

const FLOOR_NAME = 'war-room-castle-floor-slab';
const COMMAND_DESK_TOP_NAME = 'war-room-command-desk-top';
const SERVICE_EVENTS = new Set(['water-plant', 'espresso']);

function makeWateringCan() {
  const group = new THREE.Group();
  group.name = 'war-room-hans-watering-can';
  const metal = new THREE.MeshPhysicalMaterial({ color: 0x69777b, metalness: 0.58, roughness: 0.42 });
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.19, 0.34, 12), metal);
  body.rotation.z = Math.PI / 2;
  body.castShadow = true;
  group.add(body);
  const spout = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.075, 0.52, 10), metal);
  spout.position.set(0.33, 0.05, 0);
  spout.rotation.z = Math.PI / 2 - 0.22;
  spout.castShadow = true;
  group.add(spout);
  group.position.set(-0.34, 0.64, 0.16);
  return group;
}

function makeTray() {
  const group = new THREE.Group();
  group.name = 'war-room-hans-espresso-tray';
  const trayMat = new THREE.MeshPhysicalMaterial({ color: 0x755d37, metalness: 0.45, roughness: 0.38 });
  const porcelain = new THREE.MeshPhysicalMaterial({ color: 0xe5dfd1, roughness: 0.34, clearcoat: 0.18 });
  const coffee = new THREE.MeshPhysicalMaterial({ color: 0x2e170d, roughness: 0.7 });
  const tray = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 0.035, 20), trayMat);
  tray.castShadow = true;
  group.add(tray);
  const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.085, 0.072, 0.12, 16), porcelain);
  cup.position.y = 0.075;
  cup.castShadow = true;
  group.add(cup);
  const liquid = new THREE.Mesh(new THREE.CylinderGeometry(0.069, 0.069, 0.008, 16), coffee);
  liquid.position.y = 0.138;
  group.add(liquid);
  group.position.set(0, 0.76, 0.38);
  return group;
}

function ensureCarriedProps(actor) {
  let can = actor.hans.getObjectByName?.('war-room-hans-watering-can');
  let tray = actor.hans.getObjectByName?.('war-room-hans-espresso-tray');
  if (!can) { can = makeWateringCan(); actor.hans.add(can); }
  if (!tray) { tray = makeTray(); actor.hans.add(tray); }
  can.visible = false;
  tray.visible = false;
  return { can, tray };
}

function getCommandDeskTop(root) {
  return root?.getObjectByName?.(COMMAND_DESK_TOP_NAME) || null;
}

function ensureDeliveredEspresso(root) {
  const existing = root.getObjectByName?.('war-room-hans-delivered-espresso');
  if (existing) return existing;
  const deskTop = getCommandDeskTop(root);
  const deskArt = deskTop?.parent || null;
  if (!deskTop || !deskArt) return null;

  const group = new THREE.Group();
  group.name = 'war-room-hans-delivered-espresso';
  const porcelain = new THREE.MeshPhysicalMaterial({ color: 0xebe5d7, roughness: 0.32, clearcoat: 0.2 });
  const coffee = new THREE.MeshPhysicalMaterial({ color: 0x2b150c, roughness: 0.72 });
  const saucer = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.13, 0.018, 18), porcelain);
  saucer.position.y = 1.145;
  group.add(saucer);
  const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.078, 0.068, 0.12, 16), porcelain);
  cup.position.y = 1.215;
  cup.castShadow = true;
  group.add(cup);
  const liquid = new THREE.Mesh(new THREE.CylinderGeometry(0.064, 0.064, 0.007, 16), coffee);
  liquid.position.y = 1.279;
  group.add(liquid);
  group.position.set(0.94, 0, 0.12);
  group.visible = false;
  deskArt.add(group);
  return group;
}

function setDialogue(actor, phase) {
  const canvas = getWarRoomHansCanvas(actor);
  if (canvas?.dataset) canvas.dataset.warRoomHansServiceDialogue = phase || '';
}

function finish(actor, props, controller, root, runtime, taskId) {
  resetWarRoomHansWalk(controller, { full: true });
  setWarRoomHansTaskPhase(runtime, 'idle');
  setWarRoomHansTaskPresentation(runtime, {
    visible: false,
    motionState: 'idle',
    route: '',
  });
  props.can.visible = false;
  props.tray.visible = false;
  setDialogue(actor, '');
  setWarRoomHansServiceDoor(root, 0);
  releaseWarRoomHansTask(runtime, taskId);
}

export function installWarRoomHansServiceRoutine(root) {
  const actor = getWarRoomHansActor(root);
  const floor = root?.getObjectByName?.(FLOOR_NAME);
  if (!actor || !floor || typeof floor.onBeforeRender !== 'function') return 0;
  if (floor.userData?.warRoomHansServiceRoutine === WAR_ROOM_HANS_SERVICE_ROUTINE_VERSION) return 0;

  const runtime = getWarRoomHansRuntime(actor);
  const previous = floor.onBeforeRender;
  const controller = createWarRoomHansWalkController(actor, { forward: 1 });
  if (!runtime || !controller) return 0;
  const props = ensureCarriedProps(actor);
  const plant = ensureWarRoomHansPlant(root);
  const deliveredEspresso = ensureDeliveredEspresso(root);

  let eventName = '';
  let gameId = '';
  let eligibleSince = 0;
  let delayMs = 0;
  let completedGameId = '';
  let active = false;
  let state = 'idle';
  let home = null;
  let target = null;
  let routeIn = [];
  let routeOut = [];
  let routeIndex = 0;
  let actionElapsed = 0;
  let lastNow = null;

  floor.onBeforeRender = (...args) => {
    previous?.(...args);
    const now = typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now();
    const delta = lastNow == null ? 0 : Math.max(0, Math.min(250, now - lastNow));
    lastNow = now;

    const nextGameId = getWarRoomHansGameId(actor);
    if (!nextGameId) return;
    if (nextGameId !== gameId) {
      if (active && eventName) finish(actor, props, controller, root, runtime, `service-${eventName}`);
      gameId = nextGameId;
      eventName = warRoomHansEventForGame(gameId);
      eligibleSince = now;
      delayMs = warRoomHansAmbientDelayMs(gameId, { min: 18000, max: 48000, salt: eventName });
      active = false;
      state = 'idle';
      home = null;
      target = null;
      routeIn = [];
      routeOut = [];
      routeIndex = 0;
      if (deliveredEspresso) deliveredEspresso.visible = false;
      setDialogue(actor, '');
    }

    if (!SERVICE_EVENTS.has(eventName) || completedGameId === gameId) return;
    const taskId = `service-${eventName}`;

    if (!active) {
      if (!warRoomHansTaskAvailable(runtime, taskId) || now - eligibleSince < delayMs) return;
      if (!assignWarRoomHansTask(runtime, {
        id: taskId,
        kind: 'service',
        source: 'WarRoomHansServiceRoutine',
        payload: { eventName },
      })) return;
      const service = warRoomHansServiceHome(root, actor.hans.parent);
      const serviceTargetObject = eventName === 'water-plant' ? plant : getCommandDeskTop(root);
      if (!service?.point || !serviceTargetObject) {
        releaseWarRoomHansTask(runtime, taskId);
        return;
      }
      home = service.point;
      target = eventName === 'water-plant'
        ? warRoomHansTargetNearObject(serviceTargetObject, actor.hans.parent, { offsetX: -0.72, offsetZ: 0.06 })
        : warRoomHansTargetNearObject(serviceTargetObject, actor.hans.parent, { offsetX: -1.78, offsetZ: 0.74 });
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
      placeWarRoomHansHorizontal(actor, home);
      setWarRoomHansTaskPresentation(runtime, {
        visible: true,
        motionState: 'walk-service',
        route: `service-${eventName}`,
      });
      setWarRoomHansTaskPhase(runtime, 'walking-in');
      setWarRoomHansServiceDoor(root, 1);
      props.can.visible = eventName === 'water-plant';
      props.tray.visible = eventName === 'espresso';
      state = 'walking-in';
      active = true;
      actionElapsed = 0;
      routeIndex = 0;
      actor.hans.userData.warRoomHansServiceEvent = eventName;
    }

    if (state === 'walking-in') {
      setWarRoomHansServiceDoor(root, Math.max(0, 1 - Math.min(1, actionElapsed / 1200)));
      actionElapsed += delta;
      const motion = moveWarRoomHansAlongRoute(
        actor.hans,
        routeIn,
        routeIndex,
        HANS_SERVICE_WALK_SPEED * delta / 1000,
      );
      routeIndex = motion.index;
      setWarRoomHansTaskPresentation(runtime, {
        motionState: 'walk-service',
        route: `service-${eventName}`,
      });
      if (!motion.valid) {
        finish(actor, props, controller, root, runtime, taskId);
        active = false;
        completedGameId = gameId;
        return;
      }
      if (motion.travelled > 0) {
        advanceWarRoomHansWalk(controller, { travelled: motion.travelled, horizontalWeight: 0.4 });
      }
      if (motion.arrived) {
        resetWarRoomHansWalk(controller, { full: true });
        state = 'acting';
        setWarRoomHansTaskPhase(runtime, 'acting');
        actionElapsed = 0;
        routeIndex = 0;
        if (eventName === 'espresso') setDialogue(actor, 'hans-espresso');
      }
      return;
    }

    if (state === 'acting') {
      actionElapsed += delta;
      setWarRoomHansTaskPresentation(runtime, { motionState: eventName });
      resetWarRoomHansWalk(controller, { full: true });
      applyWarRoomHansTaskPose(actor, eventName);
      if (eventName === 'water-plant') {
        props.can.rotation.z = -0.22 - Math.sin(Math.min(1, actionElapsed / 1600) * Math.PI) * 0.55;
        if (plant?.userData) plant.userData.warRoomHansLastWatered = gameId;
      } else {
        setDialogue(actor, warRoomHansServiceDialoguePhase(eventName, actionElapsed));
        if (actionElapsed >= 2200 && deliveredEspresso) {
          deliveredEspresso.visible = true;
          props.tray.visible = false;
        }
      }
      if (actionElapsed >= warRoomHansServiceActionMs(eventName)) {
        setDialogue(actor, '');
        state = 'returning';
        setWarRoomHansTaskPhase(runtime, 'returning');
        actionElapsed = 0;
        routeIndex = 0;
      }
      return;
    }

    if (state === 'returning') {
      const motion = moveWarRoomHansAlongRoute(
        actor.hans,
        routeOut,
        routeIndex,
        HANS_SERVICE_WALK_SPEED * delta / 1000,
      );
      routeIndex = motion.index;
      setWarRoomHansTaskPresentation(runtime, {
        motionState: 'walk-service',
        route: 'service-return',
      });
      if (!motion.valid) {
        finish(actor, props, controller, root, runtime, taskId);
        active = false;
        completedGameId = gameId;
        return;
      }
      if (motion.travelled > 0) {
        advanceWarRoomHansWalk(controller, { travelled: motion.travelled, horizontalWeight: 0.4 });
      }
      if (motion.arrived) {
        finish(actor, props, controller, root, runtime, taskId);
        active = false;
        state = 'done';
        completedGameId = gameId;
      }
    }
  };

  floor.userData.warRoomHansServiceRoutine = WAR_ROOM_HANS_SERVICE_ROUTINE_VERSION;
  return 1;
}

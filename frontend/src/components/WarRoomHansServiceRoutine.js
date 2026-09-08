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
  warRoomHansEventForGame,
} from './WarRoomHansEventContract.js';
import { ensureWarRoomHansPlant } from './WarRoomHansPlantDecor.js';
import {
  HANS_SERVICE_WALK_SPEED,
  moveWarRoomHansToward,
  setWarRoomHansServiceDoor,
  warRoomHansServiceHome,
  warRoomHansTargetNearObject,
} from './WarRoomHansServiceRoute.js';
import {
  advanceHansWalkCycle,
  createHansWalkCycle,
  resetHansWalkCycle,
} from './HansWalkCycle.js';

export const WAR_ROOM_HANS_SERVICE_ROUTINE_VERSION = 'hans-service-routine-v1';
export const HANS_ESPRESSO_LINE = 'Su espresso, señor.';
export const MATTHIAS_ESPRESSO_LINE = 'Danke, Hans. Déjamelo por ahí.';

const FLOOR_NAME = 'war-room-castle-floor-slab';
const CONSOLE_NAME = 'war-room-side-console-right';
const SERVICE_EVENTS = new Set(['water-plant', 'espresso']);
const ACTION_MS = Object.freeze({ 'water-plant': 6500, espresso: 9200 });

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

function ensureDeliveredEspresso(root) {
  const existing = root.getObjectByName?.('war-room-hans-delivered-espresso');
  if (existing) return existing;
  const consoleGroup = root.getObjectByName?.(CONSOLE_NAME);
  if (!consoleGroup) return null;
  const group = new THREE.Group();
  group.name = 'war-room-hans-delivered-espresso';
  const porcelain = new THREE.MeshPhysicalMaterial({ color: 0xebe5d7, roughness: 0.32, clearcoat: 0.2 });
  const coffee = new THREE.MeshPhysicalMaterial({ color: 0x2b150c, roughness: 0.72 });
  const saucer = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.13, 0.018, 18), porcelain);
  saucer.position.y = 1.035;
  group.add(saucer);
  const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.078, 0.068, 0.12, 16), porcelain);
  cup.position.y = 1.105;
  cup.castShadow = true;
  group.add(cup);
  const liquid = new THREE.Mesh(new THREE.CylinderGeometry(0.064, 0.064, 0.007, 16), coffee);
  liquid.position.y = 1.169;
  group.add(liquid);
  group.position.set(0, 0, 0.42);
  group.visible = false;
  consoleGroup.add(group);
  return group;
}

function setDialogue(actor, phase) {
  const canvas = getWarRoomHansCanvas(actor);
  if (canvas?.dataset) canvas.dataset.warRoomHansServiceDialogue = phase || '';
}

function serviceDialoguePhase(elapsedMs) {
  if (elapsedMs < 4200) return 'hans-espresso';
  if (elapsedMs < 8800) return 'matthias-espresso';
  return '';
}

function finish(actor, props, controller, root, routineName) {
  resetHansWalkCycle(controller, { full: true });
  actor.hans.visible = false;
  actor.hans.userData.warRoomHansMotionState = 'idle';
  actor.hans.userData.warRoomHansRoute = '';
  props.can.visible = false;
  props.tray.visible = false;
  setDialogue(actor, '');
  setWarRoomHansServiceDoor(root, 0);
  releaseWarRoomHansRoutine(actor, routineName);
}

export function installWarRoomHansServiceRoutine(root) {
  const actor = getWarRoomHansActor(root);
  const floor = root?.getObjectByName?.(FLOOR_NAME);
  if (!actor || !floor || typeof floor.onBeforeRender !== 'function') return 0;
  if (floor.userData?.warRoomHansServiceRoutine === WAR_ROOM_HANS_SERVICE_ROUTINE_VERSION) return 0;

  const previous = floor.onBeforeRender;
  const controller = createHansWalkCycle(actor.body, { forward: 1 });
  if (!controller) return 0;
  const props = ensureCarriedProps(actor);
  const plant = ensureWarRoomHansPlant(root);
  const deliveredEspresso = ensureDeliveredEspresso(root);

  let eventName = '';
  let gameId = '';
  let eligibleSince = 0;
  let delayMs = 0;
  let active = false;
  let state = 'idle';
  let home = null;
  let target = null;
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
      gameId = nextGameId;
      eventName = warRoomHansEventForGame(gameId);
      eligibleSince = now;
      delayMs = warRoomHansAmbientDelayMs(gameId, { min: 18000, max: 48000, salt: eventName });
      active = false;
      state = 'idle';
      if (deliveredEspresso) deliveredEspresso.visible = false;
      setDialogue(actor, '');
    }

    if (!SERVICE_EVENTS.has(eventName)) return;
    const routineName = `service-${eventName}`;

    if (!active) {
      if (!warRoomHansRoutineAvailable(actor, routineName) || now - eligibleSince < delayMs) return;
      if (!acquireWarRoomHansRoutine(actor, routineName)) return;
      const service = warRoomHansServiceHome(root, actor.hans.parent);
      if (!service?.point) { releaseWarRoomHansRoutine(actor, routineName); return; }
      home = service.point;
      actor.hans.position.copy(home);
      actor.hans.visible = true;
      setWarRoomHansServiceDoor(root, 1);
      props.can.visible = eventName === 'water-plant';
      props.tray.visible = eventName === 'espresso';
      target = eventName === 'water-plant'
        ? warRoomHansTargetNearObject(plant, actor.hans.parent, { offsetX: -0.72, offsetZ: 0.06 })
        : warRoomHansTargetNearObject(root.getObjectByName?.(CONSOLE_NAME), actor.hans.parent, { offsetX: -0.65, offsetZ: 0.1 });
      state = 'walking-in';
      active = true;
      actionElapsed = 0;
      actor.hans.userData.warRoomHansServiceEvent = eventName;
    }

    if (state === 'walking-in') {
      setWarRoomHansServiceDoor(root, Math.max(0, 1 - Math.min(1, actionElapsed / 1200)));
      actionElapsed += delta;
      const motion = moveWarRoomHansToward(actor.hans, target, HANS_SERVICE_WALK_SPEED * delta / 1000);
      actor.hans.userData.warRoomHansMotionState = 'walk-service';
      actor.hans.userData.warRoomHansRoute = `service-${eventName}`;
      if (motion.travelled > 0) advanceHansWalkCycle(controller, { travelled: motion.travelled, horizontalWeight: 0.4 });
      if (motion.arrived) {
        resetHansWalkCycle(controller, { full: true });
        state = 'acting';
        actionElapsed = 0;
        if (eventName === 'espresso') setDialogue(actor, 'hans-espresso');
      }
      return;
    }

    if (state === 'acting') {
      actionElapsed += delta;
      actor.hans.userData.warRoomHansMotionState = eventName;
      resetHansWalkCycle(controller, { full: true });
      if (eventName === 'water-plant') {
        props.can.rotation.z = -0.22 - Math.sin(Math.min(1, actionElapsed / 1600) * Math.PI) * 0.55;
        if (actor.body.rightArm) actor.body.rightArm.rotation.x -= 0.58;
        if (actor.body.torso) actor.body.torso.rotation.x += 0.035;
        if (plant?.userData) plant.userData.warRoomHansLastWatered = gameId;
      } else {
        setDialogue(actor, serviceDialoguePhase(actionElapsed));
        if (actor.body.leftArm) actor.body.leftArm.rotation.x -= 0.38;
        if (actor.body.rightArm) actor.body.rightArm.rotation.x -= 0.38;
        if (actionElapsed >= 2200 && deliveredEspresso) {
          deliveredEspresso.visible = true;
          props.tray.visible = false;
        }
      }
      if (actionElapsed >= ACTION_MS[eventName]) {
        setDialogue(actor, '');
        state = 'returning';
        actionElapsed = 0;
      }
      return;
    }

    if (state === 'returning') {
      const motion = moveWarRoomHansToward(actor.hans, home, HANS_SERVICE_WALK_SPEED * delta / 1000);
      actor.hans.userData.warRoomHansMotionState = 'walk-service';
      actor.hans.userData.warRoomHansRoute = 'service-return';
      if (motion.travelled > 0) advanceHansWalkCycle(controller, { travelled: motion.travelled, horizontalWeight: 0.4 });
      if (motion.arrived) {
        setWarRoomHansServiceDoor(root, 1);
        finish(actor, props, controller, root, routineName);
        active = false;
        state = 'done';
        eligibleSince = Number.POSITIVE_INFINITY;
      }
    }
  };

  floor.userData.warRoomHansServiceRoutine = WAR_ROOM_HANS_SERVICE_ROUTINE_VERSION;
  return 1;
}

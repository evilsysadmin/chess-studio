import * as THREE from 'three';
import { runWarRoomHansPostInstall } from './WarRoomDeferredFinalizer.js';
import { WAR_ROOM_HANS_CLASSIC_STAGE, installWarRoomHansSceneRoutine } from './WarRoomHansIteration.js';

export const WAR_ROOM_HANS_STAGE_VERSION = 'hans-variant-stage-v2-anchors';

// Hans was authored inside the procedural War Room v1, where his routines find
// the hearth, armor and door by object name. Blender rooms batch their decor
// into a few runtime meshes, so each room's builder exports where Hans works
// as named empties, plus its service door leaf as a separate node whose origin
// is the hinge. The installer reads them from the loaded shell, drops a v1-like
// fireplace stand-in at the hearth and reuses the v1 routine.
//
// A room without the full set of anchors gets no Hans: the shell stays exactly
// as it was. The Duel Room never gets him.
export const WAR_ROOM_HANS_ANCHORS = Object.freeze({
  // Floor point at the centre of the hearth mouth.
  hearth: 'WR_ANCHOR_hans_hearth',
  // Where Hans appears/disappears, just inside the door threshold.
  door: 'WR_ANCHOR_hans_door',
  basket: 'WR_ANCHOR_hans_basket',
  tools: 'WR_ANCHOR_hans_tools',
  // WR_ANCHOR_hans_corridor_0..N: waypoints from the door towards the hearth.
  corridorPrefix: 'WR_ANCHOR_hans_corridor_',
  // Door leaf mesh, origin on the hinge. Extras: war_room_hans_door_open_yaw.
  doorLeaf: 'WR_HANS_door_leaf',
});

const DEFAULT_EXCLUDE = Object.freeze([
  // v1 post-install steps that look for v1-only furniture (plant, service
  // desk, mop anchors). Blender rooms opt into them as they gain the anchors.
  'hans:service-infrastructure',
  'hans:plant',
  'hans:mop-routine',
  'hans:service-routine',
  'hans:ambient-chore-routine',
  'hans:canonical-plant-lock',
]);

export const WAR_ROOM_HANS_ROOMS = Object.freeze({
  v2: Object.freeze({ id: 'v2-blender-hall', excludePostInstall: DEFAULT_EXCLUDE }),
  v3: Object.freeze({ id: 'v3-armory-hall', excludePostInstall: DEFAULT_EXCLUDE }),
  v4: Object.freeze({ id: 'v4-tower-study', excludePostInstall: DEFAULT_EXCLUDE }),
});

// v1's fireplace origin sits this high above its floor; Hans hangs from it.
const HEARTH_LIFT = 0.57;
const FLAME_LIFT = 0.78;
const FLAME_DEPTH = 0.15;
const DEFAULT_DOOR_OPEN_YAW = 1.45;

export function warRoomHansRoom(variant) {
  return WAR_ROOM_HANS_ROOMS[variant] || null;
}

function worldPoint(object) {
  const point = new THREE.Vector3();
  object.getWorldPosition(point);
  return point;
}

function corridorAnchors(shellRoot) {
  const found = [];
  for (let index = 0; index < 16; index += 1) {
    const anchor = shellRoot.getObjectByName?.(`${WAR_ROOM_HANS_ANCHORS.corridorPrefix}${index}`);
    if (!anchor) break;
    found.push(anchor);
  }
  return found;
}

// Reads Hans' anchors from a loaded shell and expresses them in the frame the
// v1 routine works in: lateral grows towards the door, depth from the hearth
// towards the board. Returns { missing } when the room is not ready for Hans.
export function readWarRoomHansStageAnchors(shellRoot, { id = 'blender-room' } = {}) {
  if (!shellRoot?.getObjectByName) return { missing: ['shell'] };
  const names = ['hearth', 'door', 'basket', 'tools', 'doorLeaf'];
  const objects = Object.fromEntries(names.map((key) => [key, shellRoot.getObjectByName(WAR_ROOM_HANS_ANCHORS[key])]));
  const corridor = corridorAnchors(shellRoot);
  const missing = names.filter((key) => !objects[key]);
  if (!corridor.length) missing.push('corridor');
  if (missing.length) return { missing };

  shellRoot.updateMatrixWorld?.(true);
  const hearth = worldPoint(objects.hearth);
  const door = worldPoint(objects.door);
  const board = worldPoint(shellRoot);
  const side = Math.sign(door.x - hearth.x) || -1;
  const towardBoard = Math.sign(board.z - hearth.z) || 1;
  const local = (point) => [(point.x - hearth.x) * side, (point.z - hearth.z) * towardBoard];

  const doorLocal = local(door);
  const basket = local(worldPoint(objects.basket));
  const tools = local(worldPoint(objects.tools));
  const stage = Object.freeze({
    ...WAR_ROOM_HANS_CLASSIC_STAGE,
    id,
    doorX: doorLocal[0],
    basketX: basket[0],
    basketZ: basket[1],
    toolsX: tools[0],
    toolsZ: tools[1],
    entrySeconds: 11,
    corridor: Object.freeze([doorLocal, ...corridor.map((anchor) => local(worldPoint(anchor)))].map(Object.freeze)),
  });
  return {
    missing: [],
    stage,
    side,
    towardBoard,
    hearth,
    door,
    doorLeaf: objects.doorLeaf,
  };
}

// The leaf is wrapped in a pivot at its hinge so opening is a plain yaw in the
// shell's (upright) frame, whatever rotation the exporter left on the leaf.
function wrapDoorLeaf(leaf, { side, doorZ }) {
  const parent = leaf.parent;
  if (!parent) return null;
  const pivot = new THREE.Group();
  pivot.name = 'war-room-hans-door-pivot';
  pivot.position.copy(leaf.position);
  parent.add(pivot);
  const leafPosition = leaf.position.clone();
  leaf.position.set(0, 0, 0);
  pivot.add(leaf);
  const extras = leaf.userData || {};
  const yaw = Number(extras.war_room_hans_door_open_yaw);
  const refs = {
    group: pivot,
    pivot,
    panel: leaf,
    side,
    doorZ,
    closedRotation: 0,
    openRotation: Number.isFinite(yaw) ? yaw : DEFAULT_DOOR_OPEN_YAW,
    authored: true,
  };
  pivot.userData.refs = refs;
  pivot.userData.warRoomHansServiceDoor = WAR_ROOM_HANS_STAGE_VERSION;
  const release = () => {
    parent.add(leaf);
    leaf.position.copy(leafPosition);
    pivot.removeFromParent();
  };
  return { refs, release };
}

export function installWarRoomHansVariantStage(scene, {
  variant,
  coarsePointer = false,
  shellRoot = null,
} = {}) {
  const room = warRoomHansRoom(variant);
  const noop = () => {};
  if (!scene || !room) return { status: 'no-room', release: noop };
  if (scene.getObjectByName?.('war-room-fireplace')) return { status: 'occupied', release: noop };
  const anchors = readWarRoomHansStageAnchors(shellRoot, { id: room.id });
  if (anchors.missing.length) return { status: `missing:${anchors.missing.join(',')}`, release: noop };

  const { hearth, towardBoard, side, stage } = anchors;
  const door = wrapDoorLeaf(anchors.doorLeaf, { side, doorZ: anchors.door.z });
  if (!door) return { status: 'missing:door-parent', release: noop };

  const stageGroup = new THREE.Group();
  stageGroup.name = 'war-room-hans-stage';
  stageGroup.userData.warRoomHansStage = WAR_ROOM_HANS_STAGE_VERSION;
  stageGroup.userData.warRoomHansStageId = room.id;

  // The routine hangs Hans, his hearth kit and the render driver from an
  // object named like the v1 fireplace, placed at this room's hearth.
  const fireplace = new THREE.Group();
  fireplace.name = 'war-room-fireplace';
  fireplace.position.set(hearth.x, hearth.y + HEARTH_LIFT, hearth.z);
  fireplace.userData.warRoomHansStage = stage;
  fireplace.userData.warRoomHansDoorSide = side;

  // Fire stand-ins: Hans dims and revives these; the room's own fire
  // animation reads them as a multiplier (see WarRoomV3Fire).
  const fireCore = new THREE.Group();
  fireCore.name = 'war-room-fire-core';
  fireCore.position.set(0, FLAME_LIFT - HEARTH_LIFT, towardBoard * FLAME_DEPTH);
  fireplace.add(fireCore);
  const fireLight = new THREE.Object3D();
  fireLight.name = 'war-room-fire-light';
  fireLight.intensity = 1;
  fireLight.distance = 8.8;
  fireLight.userData.baseWarRoomIntensity = 1;
  fireplace.add(fireLight);

  stageGroup.add(fireplace);
  scene.add(stageGroup);
  if (shellRoot?.userData) shellRoot.userData.warRoomHansFireDimmer = { core: fireCore, light: fireLight };

  installWarRoomHansSceneRoutine(scene, { towardBoard, coarsePointer, doorRefs: door.refs });
  runWarRoomHansPostInstall(scene, { exclude: room.excludePostInstall });
  const driver = scene.getObjectByName?.('war-room-hans-fireplace-driver');
  const armed = Boolean(driver?.userData?.warRoomHansQuickIteration);

  if (scene.userData) {
    scene.userData.warRoomHansStageId = room.id;
    scene.userData.warRoomHansStageArmed = armed;
  }
  return {
    status: `${room.id}:${armed ? 'quick' : 'idle'}`,
    release: () => {
      stageGroup.removeFromParent();
      door.release();
      if (shellRoot?.userData) delete shellRoot.userData.warRoomHansFireDimmer;
      if (scene.userData) {
        delete scene.userData.warRoomHansStageId;
        delete scene.userData.warRoomHansStageArmed;
      }
    },
  };
}

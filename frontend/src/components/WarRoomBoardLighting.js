import * as THREE from 'three';

export const WAR_ROOM_BOARD_LIGHTING_VERSION = 'localized-readability-v1';

export function warRoomBoardReadabilityProfile({ coarsePointer = false } = {}) {
  // Mobile/coarse already carries the brighter global readability profile. The
  // approved visual correction was for the darker desktop War Room: lift only
  // the board plane and the front faces of the pieces without washing the room.
  if (coarsePointer) return null;

  return {
    overhead: {
      color: 0xfff0d2,
      intensity: 6.2,
      distance: 12,
      angle: Math.PI / 4.1,
      penumbra: 0.82,
      decay: 2,
      position: [0, 7.1, 0.35],
    },
    warmSide: {
      color: 0xffb365,
      intensity: 1.75,
      distance: 11,
      angle: Math.PI / 4.25,
      penumbra: 0.9,
      decay: 2,
      position: [-4.4, 3.5, 5.2],
    },
    target: [0, 0.28, 0],
    perceivedFillLift: 1.22,
  };
}

function addSpot(group, name, spec, target, position) {
  const light = new THREE.SpotLight(
    spec.color,
    spec.intensity,
    spec.distance,
    spec.angle,
    spec.penumbra,
    spec.decay,
  );
  light.name = name;
  light.position.set(...position);
  light.target = target;
  light.castShadow = false;
  light.userData.warRoomBoardLighting = WAR_ROOM_BOARD_LIGHTING_VERSION;
  group.add(light);
  return light;
}

export function installWarRoomBoardReadabilityLights(scene, {
  whiteSide = true,
  coarsePointer = false,
} = {}) {
  const profile = warRoomBoardReadabilityProfile({ coarsePointer });
  if (!scene || !profile) return null;

  const existing = scene.getObjectByName?.('war-room-board-readability-lights');
  if (existing) return existing.userData.warRoomBoardLightingApi || null;

  const group = new THREE.Group();
  group.name = 'war-room-board-readability-lights';
  group.userData.warRoomBoardLighting = WAR_ROOM_BOARD_LIGHTING_VERSION;
  group.userData.warRoomBoardPerceivedFillLift = profile.perceivedFillLift;

  const target = new THREE.Object3D();
  target.name = 'war-room-board-readability-target';
  target.position.set(...profile.target);
  group.add(target);

  const overhead = addSpot(
    group,
    'war-room-board-overhead-fill',
    profile.overhead,
    target,
    profile.overhead.position,
  );

  const sidePosition = [...profile.warmSide.position];
  sidePosition[2] *= whiteSide ? 1 : -1;
  const warmSide = addSpot(
    group,
    'war-room-board-warm-side-fill',
    profile.warmSide,
    target,
    sidePosition,
  );

  const api = { group, target, overhead, warmSide, profile };
  group.userData.warRoomBoardLightingApi = api;
  scene.add(group);
  scene.userData ||= {};
  scene.userData.warRoomBoardLighting = WAR_ROOM_BOARD_LIGHTING_VERSION;
  scene.userData.warRoomBoardPerceivedFillLift = profile.perceivedFillLift;
  return api;
}

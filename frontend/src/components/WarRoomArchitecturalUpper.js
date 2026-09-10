import * as THREE from 'three';

const UPPER_ARCHITECTURE_VERSION = 'open-ceiling-v9-canonical';
const UPPER_ARCHITECTURE_MESH_BUDGET = 0;
const RETIRED_MESHES_OMITTED = 19;

export function installWarRoomArchitecturalUpper(group, {
  wallZ,
  towardBoard,
  coarsePointer = false,
} = {}) {
  if (!group || coarsePointer || !Number.isFinite(wallZ) || !Number.isFinite(towardBoard)) return 0;
  if (group.userData.warRoomUpperArchitecture === UPPER_ARCHITECTURE_VERSION) return 0;

  // The expanded desktop framing now exposes the ceiling zone. The old
  // hammerbeam frame reads as a dark cage across the paintings, crest and
  // weather window, so the canonical War Room keeps that zone deliberately
  // open instead of hiding it again by cropping the camera.
  const layer = new THREE.Group();
  layer.name = 'war-room-upper-architecture';
  layer.userData.warRoomUpperArchitecture = UPPER_ARCHITECTURE_VERSION;
  layer.userData.warRoomUpperArchitectureMeshBudget = UPPER_ARCHITECTURE_MESH_BUDGET;
  layer.userData.warRoomUpperArchitectureZone = 'open-ceiling-camera-clear';
  layer.userData.warRoomRetiredUpperMeshesOmitted = RETIRED_MESHES_OMITTED;
  layer.userData.warRoomCeilingBeamsRemoved = true;
  layer.userData.warRoomMonogramFree = true;

  group.add(layer);
  group.userData.warRoomUpperArchitecture = UPPER_ARCHITECTURE_VERSION;
  group.userData.warRoomUpperArchitectureMeshBudget = UPPER_ARCHITECTURE_MESH_BUDGET;
  group.userData.warRoomUpperArchitectureMaxOffsetFromWall = 0;
  group.userData.warRoomRetiredUpperMeshesOmitted = RETIRED_MESHES_OMITTED;
  group.userData.warRoomCeilingBeamsRemoved = true;
  group.userData.warRoomMonogramFree = true;
  return 0;
}

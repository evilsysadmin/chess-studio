import * as THREE from 'three';

export function addWarRoomMesh(
  parent,
  geometry,
  material,
  position,
  rotation = [0, 0, 0],
  name = '',
) {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(...position);
  mesh.rotation.set(...rotation);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  if (name) mesh.name = name;
  parent.add(mesh);
  return mesh;
}

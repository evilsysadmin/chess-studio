import * as THREE from 'three';

function add(group, geometry, material, position = [0, 0, 0], rotation = [0, 0, 0], name = '', part = '') {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(...position);
  mesh.rotation.set(...rotation);
  if (name) mesh.name = name;
  if (part) mesh.userData.playerKingPart = part;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  group.add(mesh);
  return mesh;
}

function lathe(group, profile, material, segments, name = '', part = '') {
  return add(
    group,
    new THREE.LatheGeometry(profile.map(([radius, y]) => new THREE.Vector2(radius, y)), segments),
    material,
    [0, 0, 0],
    [0, 0, 0],
    name,
    part,
  );
}

/**
 * The human king should read as a sovereign from the fixed tactical camera,
 * not as the bishop with a cross glued on top. Keep a confident base and a
 * clear shoulder line, but avoid the bodybuilder silhouette that overwhelms
 * neighbouring pieces in perspective. Height/crown remain the primary king cue.
 */
export function buildPlayerKing3D(mainMaterial, accentMaterial, { coarsePointer = false } = {}) {
  const group = new THREE.Group();
  group.name = 'player-sovereign-king';
  group.userData.board3DPlayerKing = true;
  group.userData.board3DPlayerKingSilhouetteVersion = coarsePointer
    ? 'armored-sovereign-lite-v2'
    : 'armored-sovereign-v2';
  group.userData.board3DPlayerKingBodyProfile = 'athletic-shouldered-v2';
  group.userData.board3DPlayerKingCrownProfile = coarsePointer
    ? 'four-buttress-crown-v1'
    : 'six-buttress-crown-v1';

  const segments = coarsePointer ? 20 : 40;
  const radialSegments = coarsePointer ? 8 : 12;
  const crownButtresses = coarsePointer ? 4 : 6;

  // Still broader than a common Staunton base, but no longer fills the square
  // like a small armoured refrigerator when seen through the tactical camera.
  lathe(group, [
    [0.36, 0], [0.395, 0.045], [0.395, 0.095], [0.365, 0.135],
    [0.325, 0.175], [0.30, 0.22], [0.275, 0.275], [0.265, 0.325],
  ], mainMaterial, segments, 'player-king-base', 'base');
  add(
    group,
    new THREE.TorusGeometry(0.305, coarsePointer ? 0.022 : 0.026, radialSegments, segments),
    accentMaterial,
    [0, 0.205, 0],
    [Math.PI / 2, 0, 0],
    'player-king-base-band',
    'base-band',
  );

  // A strong torso remains, but the upper body tapers instead of exploding into
  // shoulders. This keeps the king imposing without dwarfing rooks and bishops.
  lathe(group, [
    [0.255, 0.30], [0.25, 0.37], [0.235, 0.47], [0.225, 0.60],
    [0.22, 0.70], [0.24, 0.79], [0.285, 0.86], [0.30, 0.90],
    [0.29, 0.94], [0.255, 0.975],
  ], mainMaterial, segments, 'player-king-body', 'body');
  add(
    group,
    new THREE.TorusGeometry(0.295, coarsePointer ? 0.023 : 0.028, radialSegments, segments),
    accentMaterial,
    [0, 0.895, 0],
    [Math.PI / 2, 0, 0],
    'player-king-shoulder-ring',
    'shoulder-ring',
  );

  // Compact guards preserve the armoured cue without giving him linebacker pads.
  for (let index = 0; index < 4; index += 1) {
    const angle = Math.PI / 4 + index * Math.PI / 2;
    add(
      group,
      new THREE.BoxGeometry(coarsePointer ? 0.105 : 0.12, 0.085, coarsePointer ? 0.09 : 0.10),
      mainMaterial,
      [Math.cos(angle) * 0.255, 0.88, Math.sin(angle) * 0.255],
      [0, -angle, 0],
      `player-king-shoulder-guard-${index + 1}`,
      'shoulder-guard',
    );
  }

  // Crown stays substantial: authority should come from the crown/height rather
  // than from turning the entire piece into a steroid experiment.
  add(
    group,
    new THREE.CylinderGeometry(0.27, 0.245, 0.13, segments),
    mainMaterial,
    [0, 1.015, 0],
    [0, 0, 0],
    'player-king-crown-base',
    'crown-base',
  );
  add(
    group,
    new THREE.TorusGeometry(0.262, coarsePointer ? 0.020 : 0.024, radialSegments, segments),
    accentMaterial,
    [0, 0.955, 0],
    [Math.PI / 2, 0, 0],
    'player-king-crown-band',
    'crown-band',
  );

  for (let index = 0; index < crownButtresses; index += 1) {
    const angle = index * (Math.PI * 2 / crownButtresses);
    add(
      group,
      new THREE.ConeGeometry(coarsePointer ? 0.052 : 0.058, coarsePointer ? 0.19 : 0.22, radialSegments),
      accentMaterial,
      [Math.cos(angle) * 0.195, 1.155, Math.sin(angle) * 0.195],
      [0, 0, 0],
      `player-king-crown-buttress-${index + 1}`,
      'crown-buttress',
    );
  }

  // Keep the cross intentionally prominent. It remains the final king cue and
  // survives the reduced body mass cleanly at both desktop and coarse-pointer sizes.
  add(
    group,
    new THREE.BoxGeometry(coarsePointer ? 0.095 : 0.105, coarsePointer ? 0.34 : 0.37, coarsePointer ? 0.095 : 0.105),
    accentMaterial,
    [0, coarsePointer ? 1.31 : 1.325, 0],
    [0, 0, 0],
    'player-king-cross-vertical',
    'cross-vertical',
  );
  add(
    group,
    new THREE.BoxGeometry(coarsePointer ? 0.30 : 0.335, coarsePointer ? 0.09 : 0.10, coarsePointer ? 0.095 : 0.105),
    accentMaterial,
    [0, coarsePointer ? 1.34 : 1.365, 0],
    [0, 0, 0],
    'player-king-cross-horizontal',
    'cross-horizontal',
  );

  group.scale.setScalar(coarsePointer ? 0.96 : 1.0);
  group.userData.board3DPremiumPieceScale = group.scale.x;
  return group;
}

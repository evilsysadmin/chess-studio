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
 * The human king needs to read as a sovereign from the fixed tactical camera,
 * not as the bishop with a cross glued on top. Keep the silhouette deliberately
 * broad through the base/shoulders, then finish it with a heavy crown block and
 * oversized cross. Detail is structural rather than humanoid so it remains a
 * chess piece next to Matthias' character model.
 */
export function buildPlayerKing3D(mainMaterial, accentMaterial, { coarsePointer = false } = {}) {
  const group = new THREE.Group();
  group.name = 'player-sovereign-king';
  group.userData.board3DPlayerKing = true;
  group.userData.board3DPlayerKingSilhouetteVersion = coarsePointer
    ? 'armored-sovereign-lite-v1'
    : 'armored-sovereign-v1';
  group.userData.board3DPlayerKingBodyProfile = 'broad-shouldered-v1';
  group.userData.board3DPlayerKingCrownProfile = coarsePointer
    ? 'four-buttress-crown-v1'
    : 'six-buttress-crown-v1';

  const segments = coarsePointer ? 20 : 40;
  const radialSegments = coarsePointer ? 8 : 12;
  const crownButtresses = coarsePointer ? 4 : 6;

  // Heavy footprint: wider than the common Staunton base, but still safely
  // inside a 1x1 board square even with interaction motion applied.
  lathe(group, [
    [0.385, 0], [0.43, 0.045], [0.43, 0.095], [0.39, 0.135],
    [0.345, 0.175], [0.315, 0.22], [0.285, 0.275], [0.27, 0.325],
  ], mainMaterial, segments, 'player-king-base', 'base');
  add(
    group,
    new THREE.TorusGeometry(0.325, coarsePointer ? 0.024 : 0.029, radialSegments, segments),
    accentMaterial,
    [0, 0.205, 0],
    [Math.PI / 2, 0, 0],
    'player-king-base-band',
    'base-band',
  );

  // Broad armored torso and a pronounced shoulder line prevent the bishop-like
  // narrow waist that the old generic king inherited.
  lathe(group, [
    [0.27, 0.30], [0.265, 0.37], [0.245, 0.47], [0.23, 0.60],
    [0.225, 0.70], [0.25, 0.79], [0.305, 0.86], [0.33, 0.90],
    [0.315, 0.94], [0.27, 0.975],
  ], mainMaterial, segments, 'player-king-body', 'body');
  add(
    group,
    new THREE.TorusGeometry(0.325, coarsePointer ? 0.026 : 0.032, radialSegments, segments),
    accentMaterial,
    [0, 0.895, 0],
    [Math.PI / 2, 0, 0],
    'player-king-shoulder-ring',
    'shoulder-ring',
  );

  // Four/six compact shoulder guards read as mass at tactical distance without
  // turning the piece into a literal little human in armour.
  for (let index = 0; index < 4; index += 1) {
    const angle = Math.PI / 4 + index * Math.PI / 2;
    add(
      group,
      new THREE.BoxGeometry(coarsePointer ? 0.13 : 0.15, 0.095, coarsePointer ? 0.10 : 0.115),
      mainMaterial,
      [Math.cos(angle) * 0.285, 0.88, Math.sin(angle) * 0.285],
      [0, -angle, 0],
      `player-king-shoulder-guard-${index + 1}`,
      'shoulder-guard',
    );
  }

  // Crown pedestal is deliberately blockier and wider than the bishop's mitre.
  add(
    group,
    new THREE.CylinderGeometry(0.285, 0.255, 0.13, segments),
    mainMaterial,
    [0, 1.015, 0],
    [0, 0, 0],
    'player-king-crown-base',
    'crown-base',
  );
  add(
    group,
    new THREE.TorusGeometry(0.277, coarsePointer ? 0.021 : 0.026, radialSegments, segments),
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
      new THREE.ConeGeometry(coarsePointer ? 0.055 : 0.063, coarsePointer ? 0.19 : 0.22, radialSegments),
      accentMaterial,
      [Math.cos(angle) * 0.205, 1.155, Math.sin(angle) * 0.205],
      [0, 0, 0],
      `player-king-crown-buttress-${index + 1}`,
      'crown-buttress',
    );
  }

  // The cross is intentionally oversized and thick. It is the final king cue,
  // not the entire identity of the piece as in the old model.
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
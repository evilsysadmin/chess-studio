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
 * The human king is a chess piece, not a character. Readability comes from a
 * classic tall Staunton silhouette and an unmistakable cross, with restrained
 * accent rings tying it to the selected 3D skin. Keep it elegant and only
 * moderately larger than neighbouring pieces; Matthias owns the theatrics.
 */
export function buildPlayerKing3D(mainMaterial, accentMaterial, { coarsePointer = false } = {}) {
  const group = new THREE.Group();
  group.name = 'player-sovereign-king';
  group.userData.board3DPlayerKing = true;
  group.userData.board3DPlayerKingSilhouetteVersion = coarsePointer
    ? 'classic-sovereign-lite-v3'
    : 'classic-sovereign-v3';
  group.userData.board3DPlayerKingBodyProfile = 'staunton-taper-v3';
  group.userData.board3DPlayerKingCrownProfile = 'clean-cross-crown-v2';

  const segments = coarsePointer ? 20 : 40;
  const radialSegments = coarsePointer ? 8 : 12;

  // Confident footprint, but safely below the old 0.8-wide armoured monster.
  // The base is the widest part, as on a normal premium Staunton king.
  lathe(group, [
    [0.315, 0], [0.355, 0.038], [0.36, 0.082], [0.345, 0.12],
    [0.31, 0.16], [0.285, 0.20], [0.26, 0.245], [0.245, 0.29],
  ], mainMaterial, segments, 'player-king-base', 'base');
  add(
    group,
    new THREE.TorusGeometry(0.31, coarsePointer ? 0.018 : 0.022, radialSegments, segments),
    accentMaterial,
    [0, 0.135, 0],
    [Math.PI / 2, 0, 0],
    'player-king-base-band',
    'base-band',
  );

  // Long tapered stem: recognisably king-like without artificial shoulders.
  lathe(group, [
    [0.245, 0.285], [0.235, 0.35], [0.215, 0.47], [0.19, 0.61],
    [0.175, 0.72], [0.18, 0.79], [0.205, 0.85], [0.235, 0.90],
    [0.245, 0.94], [0.225, 0.975],
  ], mainMaterial, segments, 'player-king-body', 'body');

  // A simple collar and rounded crown cap replace shoulder pads and crown spikes.
  // The generated approved mock reads as expensive because it is clean, not busy.
  add(
    group,
    new THREE.TorusGeometry(0.228, coarsePointer ? 0.019 : 0.023, radialSegments, segments),
    accentMaterial,
    [0, 0.948, 0],
    [Math.PI / 2, 0, 0],
    'player-king-collar-band',
    'collar-band',
  );
  lathe(group, [
    [0.218, 0.965], [0.238, 0.995], [0.245, 1.035], [0.238, 1.075],
    [0.215, 1.105], [0.18, 1.125],
  ], mainMaterial, segments, 'player-king-crown-base', 'crown-base');
  add(
    group,
    new THREE.TorusGeometry(0.218, coarsePointer ? 0.016 : 0.020, radialSegments, segments),
    accentMaterial,
    [0, 0.995, 0],
    [Math.PI / 2, 0, 0],
    'player-king-crown-band',
    'crown-band',
  );

  // The cross is intentionally clean and prominent: this, plus height, is the
  // primary king cue. No face, no uniform, no anthropomorphic decoration.
  add(
    group,
    new THREE.BoxGeometry(coarsePointer ? 0.085 : 0.095, coarsePointer ? 0.31 : 0.34, coarsePointer ? 0.085 : 0.095),
    accentMaterial,
    [0, coarsePointer ? 1.27 : 1.285, 0],
    [0, 0, 0],
    'player-king-cross-vertical',
    'cross-vertical',
  );
  add(
    group,
    new THREE.BoxGeometry(coarsePointer ? 0.265 : 0.295, coarsePointer ? 0.08 : 0.09, coarsePointer ? 0.085 : 0.095),
    accentMaterial,
    [0, coarsePointer ? 1.30 : 1.325, 0],
    [0, 0, 0],
    'player-king-cross-horizontal',
    'cross-horizontal',
  );

  group.scale.set(
    coarsePointer ? 0.92 : 0.94,
    coarsePointer ? 0.97 : 1.0,
    coarsePointer ? 0.92 : 0.94,
  );
  group.userData.board3DPremiumPieceScale = group.scale.x;
  return group;
}

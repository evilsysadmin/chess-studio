import * as THREE from 'three';

function add(group, geometry, material, position = [0, 0, 0], rotation = [0, 0, 0], scale = null, name = '') {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(...position);
  mesh.rotation.set(...rotation);
  if (scale) mesh.scale.set(...scale);
  if (name) mesh.name = name;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  group.add(mesh);
  return mesh;
}

function lathe(group, profile, material, segments, name = '') {
  return add(
    group,
    new THREE.LatheGeometry(profile.map(([radius, y]) => new THREE.Vector2(radius, y)), segments),
    material,
    [0, 0, 0],
    [0, 0, 0],
    null,
    name,
  );
}

function mat(color, options = {}) {
  const owned = new THREE.MeshPhysicalMaterial({
    color,
    metalness: options.metalness ?? 0.08,
    roughness: options.roughness ?? 0.62,
    clearcoat: options.clearcoat ?? 0.12,
    clearcoatRoughness: options.clearcoatRoughness ?? 0.42,
    envMapIntensity: options.envMapIntensity ?? 0.36,
    specularIntensity: options.specularIntensity ?? 0.34,
  });
  owned.userData.matthiasOwnedMaterial = true;
  return owned;
}

/**
 * Matthias is read from tactical-camera distance, not from a portrait crop.
 * Keep the face intentionally simple and directional: narrow inward-sloping
 * eyes, a low command scowl and one short pressed mouth. Tiny cheeks, lip
 * creases and extra brow geometry collapse together at board scale and create
 * accidental fear/sadness instead of the intended proud anger.
 */
export function buildMatthiasKing3D(mainMaterial, accentMaterial, {
  coarsePointer = false,
  faceTowardCamera = true,
  pieceColor = 'w',
  skinId = 'studio',
} = {}) {
  const group = new THREE.Group();
  group.name = 'matthias-rival-king';
  group.userData.matthiasKing = true;
  group.userData.faceStyle = 'proud-command-scowl-v5';
  group.userData.capStyle = 'command-peaked-cap-v3';
  group.userData.posture = 'proud-command-v2';
  group.userData.motionRig = 'head-rig-v1';
  group.userData.pieceColor = pieceColor;
  group.userData.skinId = skinId;

  const segments = coarsePointer ? 24 : 42;
  const front = faceTowardCamera ? 1 : -1;
  const face = mat(0xd3bea0, {
    metalness: 0,
    roughness: 0.82,
    clearcoat: 0.025,
    clearcoatRoughness: 0.82,
    envMapIntensity: 0.18,
    specularIntensity: 0.14,
  });
  const faceShadow = mat(0x9b7659, {
    metalness: 0,
    roughness: 0.92,
    clearcoat: 0.01,
    envMapIntensity: 0.1,
    specularIntensity: 0.08,
  });
  const cap = mat(0x10141a, {
    metalness: 0.16,
    roughness: 0.56,
    clearcoat: 0.12,
    envMapIntensity: 0.32,
    specularIntensity: 0.28,
  });
  const capBand = mat(0x74272a, {
    metalness: 0.08,
    roughness: 0.68,
    clearcoat: 0.04,
    envMapIntensity: 0.16,
    specularIntensity: 0.14,
  });
  const brass = mat(0xc99b3f, {
    metalness: 0.8,
    roughness: 0.28,
    clearcoat: 0.24,
    clearcoatRoughness: 0.22,
    envMapIntensity: 0.62,
    specularIntensity: 0.62,
  });
  const ink = mat(0x05070a, {
    metalness: 0.02,
    roughness: 0.78,
    clearcoat: 0.01,
    envMapIntensity: 0.08,
    specularIntensity: 0.08,
  });
  const uniform = mat(pieceColor === 'b' ? 0x171b22 : 0xd8d0c1, {
    metalness: pieceColor === 'b' ? 0.1 : 0.02,
    roughness: pieceColor === 'b' ? 0.58 : 0.72,
    clearcoat: 0.06,
    envMapIntensity: pieceColor === 'b' ? 0.3 : 0.2,
    specularIntensity: pieceColor === 'b' ? 0.26 : 0.16,
  });
  const sash = mat(pieceColor === 'b' ? 0x6f2328 : 0x8a3030, {
    metalness: 0.04,
    roughness: 0.68,
    clearcoat: 0.03,
    envMapIntensity: 0.14,
    specularIntensity: 0.12,
  });

  const kingProfile = [
    [0.38, 0], [0.41, 0.04], [0.41, 0.09], [0.35, 0.14],
    [0.32, 0.19], [0.255, 0.23], [0.235, 0.3], [0.2, 0.39],
    [0.18, 0.52], [0.19, 0.61], [0.245, 0.68], [0.265, 0.73],
    [0.225, 0.78], [0.19, 0.82],
  ];
  lathe(group, kingProfile, mainMaterial, segments, 'matthias-king-body');
  add(group, new THREE.TorusGeometry(0.29, 0.027, 10, segments), accentMaterial, [0, 0.205, 0], [Math.PI / 2, 0, 0], null, 'matthias-king-base-ring');
  add(group, new THREE.TorusGeometry(0.235, 0.022, 10, segments), accentMaterial, [0, 0.73, 0], [Math.PI / 2, 0, 0], null, 'matthias-king-shoulder-ring');
  add(group, new THREE.TorusGeometry(0.176, 0.016, 9, segments), brass, [0, 0.815, 0], [Math.PI / 2, 0, 0], null, 'matthias-king-collar');

  lathe(group, [
    [0.19, 0.31], [0.205, 0.38], [0.215, 0.52], [0.235, 0.63],
    [0.248, 0.69], [0.222, 0.735], [0.19, 0.765],
  ], uniform, segments, 'matthias-command-jacket');
  add(group, new THREE.BoxGeometry(0.08, 0.34, 0.022), sash, [-0.055, 0.535, front * 0.218], [0, 0, -0.43 * front], null, 'matthias-command-sash');
  add(group, new THREE.BoxGeometry(0.16, 0.045, 0.08), brass, [-0.205, 0.705, front * 0.035], [0, 0, -0.08 * front], null, 'matthias-epaulette-left');
  add(group, new THREE.BoxGeometry(0.16, 0.045, 0.08), brass, [0.205, 0.705, front * 0.035], [0, 0, 0.08 * front], null, 'matthias-epaulette-right');
  add(group, new THREE.SphereGeometry(0.026, 12, 8), brass, [-0.105, 0.58, front * 0.225], [0, 0, 0], null, 'matthias-medal-left');
  add(group, new THREE.SphereGeometry(0.021, 12, 8), brass, [-0.04, 0.55, front * 0.229], [0, 0, 0], null, 'matthias-medal-right');

  const headRig = new THREE.Group();
  headRig.name = 'matthias-head-rig';
  headRig.userData.basePosition = headRig.position.clone();
  headRig.userData.baseRotation = headRig.rotation.clone();
  headRig.userData.expression = 'proud-angry-v1';
  group.add(headRig);

  // Slightly broader and flatter than the old soft oval: more officer, less sad doll.
  add(headRig, new THREE.SphereGeometry(0.235, segments, coarsePointer ? 16 : 24), face, [0, 1.016, 0], [0, 0, 0], [1.09, 0.90, 0.92], 'matthias-face');
  const faceZ = front * 0.226;

  // Narrow eye slits angle inward to reinforce the scowl instead of reading tired.
  add(headRig, new THREE.SphereGeometry(0.027, 14, 9), ink, [-0.071, 1.029, faceZ], [0, 0, -0.11 * front], [1.28, 0.36, 0.34], 'matthias-eye-left');
  add(headRig, new THREE.SphereGeometry(0.027, 14, 9), ink, [0.071, 1.029, faceZ], [0, 0, 0.11 * front], [1.28, 0.36, 0.34], 'matthias-eye-right');

  // Low, steep brows: the inner ends point down at the nose, unmistakably angry.
  add(headRig, new THREE.BoxGeometry(0.1, 0.016, 0.018), ink, [-0.064, 1.078, front * 0.229], [0, 0, -0.38 * front], null, 'matthias-brow-left');
  add(headRig, new THREE.BoxGeometry(0.1, 0.016, 0.018), ink, [0.064, 1.078, front * 0.229], [0, 0, 0.38 * front], null, 'matthias-brow-right');

  // Keep the nose subordinate so it cannot turn the expression into a droop.
  add(headRig, new THREE.SphereGeometry(0.022, 14, 9), faceShadow, [0.004, 0.992, front * 0.236], [0, 0, 0], [0.62, 1.05, 0.46], 'matthias-nose');

  // Short, perfectly level pressed mouth: stern, not downturned.
  add(headRig, new THREE.BoxGeometry(0.108, 0.01, 0.015), ink, [0, 0.939, front * 0.231], [0, 0, 0], null, 'matthias-mouth');

  const capGroup = new THREE.Group();
  capGroup.name = 'matthias-officer-cap';
  capGroup.position.set(0, 1.14, 0);
  capGroup.rotation.z = -0.042 * front;
  capGroup.rotation.x = -0.018 * front;
  headRig.add(capGroup);

  add(capGroup, new THREE.CylinderGeometry(0.24, 0.265, 0.12, segments), cap, [0, 0.075, 0], [0, 0, 0], [1.13, 1, 0.92], 'matthias-cap');
  add(capGroup, new THREE.TorusGeometry(0.246, 0.023, 8, segments), capBand, [0, 0.025, 0], [Math.PI / 2, 0, 0], [1.07, 0.9, 1], 'matthias-cap-band');
  add(capGroup, new THREE.TorusGeometry(0.25, 0.01, 8, segments), brass, [0, 0.041, 0], [Math.PI / 2, 0, 0], [1.07, 0.9, 1], 'matthias-cap-piping');
  add(capGroup, new THREE.CylinderGeometry(0.235, 0.25, 0.052, segments), cap, [-0.006, 0.145, -front * 0.006], [0, 0, 0.025 * front], [1.17, 1, 0.91], 'matthias-cap-top');

  const visor = add(
    capGroup,
    new THREE.CylinderGeometry(0.325, 0.35, 0.03, segments, 1, false, -1.02, 2.04),
    cap,
    [0, 0.005, front * 0.175],
    [0.075 * front, 0, 0],
    [1.04, 1, 0.92],
    'matthias-visor',
  );
  visor.castShadow = true;

  add(capGroup, new THREE.SphereGeometry(0.052, 14, 9), brass, [0, 0.095, front * 0.247], [0, 0, 0], [1, 0.92, 0.52], 'matthias-cap-badge');
  add(capGroup, new THREE.CylinderGeometry(0.017, 0.026, 0.042, 10), ink, [0, 0.086, front * 0.278], [Math.PI / 2, 0, 0], null, 'matthias-cap-badge-pawn-body');
  add(capGroup, new THREE.SphereGeometry(0.022, 10, 7), ink, [0, 0.111, front * 0.28], [0, 0, 0], null, 'matthias-cap-badge-pawn-head');

  group.scale.setScalar(1.035);
  return group;
}

export function isMatthiasRivalKing(piece, rivalColor) {
  return piece?.type === 'k' && (rivalColor === 'w' || rivalColor === 'b') && piece?.color === rivalColor;
}

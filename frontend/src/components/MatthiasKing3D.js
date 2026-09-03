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
  group.userData.faceStyle = 'command-fury-scowl-v6';
  group.userData.capStyle = 'premium-command-peaked-cap-v6';
  group.userData.posture = 'proud-command-v2';
  group.userData.motionRig = 'head-rig-v1';
  group.userData.pieceColor = pieceColor;
  group.userData.skinId = skinId;

  const segments = coarsePointer ? 24 : 42;
  const front = faceTowardCamera ? 1 : -1;
  // The black king still has Matthias' pale face. Piece allegiance belongs to
  // the body/uniform; darkening the skin with the black set erases his eyes,
  // brows and mouth at tactical-camera distance.
  const face = mat(0xf2eadb, {
    metalness: 0,
    roughness: 0.82,
    clearcoat: 0.025,
    clearcoatRoughness: 0.82,
    envMapIntensity: 0.18,
    specularIntensity: 0.14,
  });
  const faceShadow = mat(0xc1ad91, {
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
  const eyeWhite = mat(0xd8d8d2, {
    metalness: 0,
    roughness: 0.88,
    clearcoat: 0.01,
    envMapIntensity: 0.08,
    specularIntensity: 0.06,
  });
  const ink = mat(0x05070a, {
    metalness: 0.02,
    roughness: 0.78,
    clearcoat: 0.01,
    envMapIntensity: 0.08,
    specularIntensity: 0.08,
  });
  // Black-side Matthias stays military and elegant rather than becoming a
  // near-black gothic silhouette. Charcoal/slate keeps the jacket readable
  // against black pieces; brass and a muted wine sash provide restrained rank.
  const uniform = mat(pieceColor === 'b' ? 0x2c3036 : 0xd8d0c1, {
    metalness: pieceColor === 'b' ? 0.08 : 0.02,
    roughness: pieceColor === 'b' ? 0.62 : 0.72,
    clearcoat: 0.06,
    envMapIntensity: pieceColor === 'b' ? 0.34 : 0.2,
    specularIntensity: pieceColor === 'b' ? 0.3 : 0.16,
  });
  const sash = mat(pieceColor === 'b' ? 0x59393b : 0x8a3030, {
    metalness: 0.04,
    roughness: pieceColor === 'b' ? 0.74 : 0.68,
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
  headRig.userData.expression = 'command-fury-v2';
  group.add(headRig);

  // Approved king-pawn reference: a pale, nearly round face under the plate cap.
  // The expression must survive board scale without reading tired or sad.
  add(headRig, new THREE.SphereGeometry(0.235, segments, coarsePointer ? 16 : 24), face, [0, 1.016, 0], [0, 0, 0], [1.06, 0.94, 0.94], 'matthias-face');
  const faceZ = front * 0.226;

  // Small pale sclera make the glare readable; the existing named eye meshes remain
  // the dark pupils so animation/consumers keep their stable handles.
  add(headRig, new THREE.SphereGeometry(0.036, 14, 9), eyeWhite, [-0.071, 1.028, faceZ], [0, 0, -0.12 * front], [1.34, 0.48, 0.36], 'matthias-eye-white-left');
  add(headRig, new THREE.SphereGeometry(0.036, 14, 9), eyeWhite, [0.071, 1.028, faceZ], [0, 0, 0.12 * front], [1.34, 0.48, 0.36], 'matthias-eye-white-right');
  add(headRig, new THREE.SphereGeometry(0.024, 14, 9), ink, [-0.069, 1.026, front * 0.233], [0, 0, -0.12 * front], [1.18, 0.34, 0.30], 'matthias-eye-left');
  add(headRig, new THREE.SphereGeometry(0.024, 14, 9), ink, [0.069, 1.026, front * 0.233], [0, 0, 0.12 * front], [1.18, 0.34, 0.30], 'matthias-eye-right');

  // Critical sign convention: inner brow ends sit LOWER than the outer ends.
  // The previous signs did the opposite and produced the recurring sad Matthias.
  add(headRig, new THREE.BoxGeometry(0.105, 0.019, 0.019), ink, [-0.064, 1.069, front * 0.231], [0, 0, -0.44 * front], null, 'matthias-brow-left');
  add(headRig, new THREE.BoxGeometry(0.105, 0.019, 0.019), ink, [0.064, 1.069, front * 0.231], [0, 0, 0.44 * front], null, 'matthias-brow-right');

  // Keep the nose subordinate so it cannot turn the expression into a droop.
  add(headRig, new THREE.SphereGeometry(0.022, 14, 9), faceShadow, [0.004, 0.992, front * 0.236], [0, 0, 0], [0.62, 1.05, 0.46], 'matthias-nose');

  // Short, slightly skewed command sneer. It is deliberately NOT downturned.
  add(headRig, new THREE.BoxGeometry(0.104, 0.012, 0.015), ink, [0.004, 0.939, front * 0.232], [0, 0, -0.055 * front], null, 'matthias-mouth');

  const capGroup = new THREE.Group();
  capGroup.name = 'matthias-officer-cap';
  // Premium plate cap based on Matthias' canonical Home silhouette: a narrow
  // fitted band, a structured flared crown, restrained red piping, braided
  // brass cord and a short curved visor. At tactical distance the crown must
  // read as an officer cap without covering the eyes or becoming a canopy.
  capGroup.position.set(0, 1.168, -front * 0.003);
  capGroup.rotation.z = -0.012 * front;
  capGroup.rotation.x = -0.026 * front;
  capGroup.userData.faceClearance = 'eyes-and-brows-visible';
  capGroup.userData.silhouette = 'home-hero-plate-cap';
  capGroup.userData.reference = 'home-command-cap-v2';
  capGroup.userData.crownFlare = 'structured-high-flare';
  headRig.add(capGroup);

  // The Home mock reads as a real plate cap because the fitted band gives way
  // to a taller crown with a decisive shoulder before the broad top. Keep the
  // mass above the face: Matthias gets command presence, not a larger visor.
  add(capGroup, new THREE.CylinderGeometry(0.205, 0.212, 0.078, segments), cap, [0, 0.037, 0], [0, 0, 0], [1.02, 1, 0.94], 'matthias-cap');
  add(capGroup, new THREE.CylinderGeometry(0.269, 0.207, 0.132, segments), cap, [-0.002, 0.141, -front * 0.004], [0, 0, 0.008 * front], [1.025, 1, 0.92], 'matthias-cap-crown');
  add(capGroup, new THREE.CylinderGeometry(0.276, 0.268, 0.026, segments), cap, [-0.006, 0.226, -front * 0.009], [0, 0, 0.018 * front], [1.025, 1, 0.92], 'matthias-cap-top');
  add(capGroup, new THREE.TorusGeometry(0.267, 0.0075, 8, segments), cap, [-0.004, 0.211, -front * 0.007], [Math.PI / 2, 0, 0], [1.025, 0.92, 1], 'matthias-cap-crown-break');

  // The mock has a readable wine band, not merely a hairline. A shallow sleeve
  // gives it body at board scale; fine piping then frames the top plate.
  add(capGroup, new THREE.CylinderGeometry(0.214, 0.216, 0.034, segments), capBand, [0, 0.058, front * 0.001], [0, 0, 0], [1.02, 1, 0.94], 'matthias-cap-band-fill');
  add(capGroup, new THREE.TorusGeometry(0.213, 0.0085, 8, segments), brass, [0, 0.077, front * 0.002], [Math.PI / 2, 0, 0], [1.02, 0.94, 1], 'matthias-cap-band');
  add(capGroup, new THREE.TorusGeometry(0.271, 0.0055, 7, segments), capBand, [-0.006, 0.237, -front * 0.009], [Math.PI / 2, 0, 0], [1.025, 0.92, 1], 'matthias-cap-red-piping');

  // A real short peaked visor: bespoke curved slab rather than the previous
  // giant cylinder sector. Width stays well inside the face silhouette and the
  // forward projection is intentionally modest.
  const visorShape = new THREE.Shape();
  visorShape.moveTo(-0.162, 0);
  visorShape.quadraticCurveTo(-0.158, 0.082, -0.101, 0.115);
  visorShape.quadraticCurveTo(0, 0.139, 0.101, 0.115);
  visorShape.quadraticCurveTo(0.158, 0.082, 0.162, 0);
  visorShape.quadraticCurveTo(0, -0.01, -0.162, 0);
  const visorGeometry = new THREE.ExtrudeGeometry(visorShape, {
    depth: 0.018,
    bevelEnabled: true,
    bevelSegments: 2,
    bevelSize: 0.004,
    bevelThickness: 0.0025,
    curveSegments: coarsePointer ? 5 : 9,
    steps: 1,
  });
  visorGeometry.translate(0, 0, -0.009);
  const visor = add(
    capGroup,
    visorGeometry,
    cap,
    [0, -0.004, front * 0.137],
    [front * (Math.PI / 2 - 0.052), 0, 0],
    null,
    'matthias-visor',
  );
  visor.castShadow = true;
  visor.userData.compactForFaceVisibility = true;
  visor.userData.shortPremiumBrim = true;

  // Braided brass cord across the front, with restrained end studs. A tube
  // curve gives the mock's slight central droop without adding fragile detail.
  const cordCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(-0.162, 0.068, front * 0.195),
    new THREE.Vector3(-0.083, 0.057, front * 0.214),
    new THREE.Vector3(0, 0.052, front * 0.22),
    new THREE.Vector3(0.083, 0.057, front * 0.214),
    new THREE.Vector3(0.162, 0.068, front * 0.195),
  ]);
  add(capGroup, new THREE.TubeGeometry(cordCurve, coarsePointer ? 12 : 22, 0.0072, 7, false), brass, [0, 0, 0], [0, 0, 0], null, 'matthias-cap-cord');
  add(capGroup, new THREE.SphereGeometry(0.013, 10, 7), brass, [-0.168, 0.071, front * 0.194], [0, 0, 0], null, 'matthias-cap-cord-stud-left');
  add(capGroup, new THREE.SphereGeometry(0.013, 10, 7), brass, [0.168, 0.071, front * 0.194], [0, 0, 0], null, 'matthias-cap-cord-stud-right');

  // Premium command crest: gold diamond/shield, dark inset and red centre.
  // Deliberately broad enough to read from the tactical camera, but still
  // subordinate to Matthias' face.
  add(capGroup, new THREE.BoxGeometry(0.072, 0.076, 0.014), brass, [0, 0.119, front * 0.214], [0, 0, Math.PI / 4], [1, 1.12, 1], 'matthias-cap-badge');
  add(capGroup, new THREE.BoxGeometry(0.048, 0.052, 0.016), ink, [0, 0.119, front * 0.223], [0, 0, Math.PI / 4], [1, 1.08, 1], 'matthias-cap-badge-inset');
  add(capGroup, new THREE.BoxGeometry(0.023, 0.025, 0.018), capBand, [0, 0.119, front * 0.234], [0, 0, Math.PI / 4], [1, 1.05, 1], 'matthias-cap-badge-gem');

  group.scale.setScalar(1.035);
  return group;
}

export function isMatthiasRivalKing(piece, rivalColor) {
  return piece?.type === 'k' && (rivalColor === 'w' || rivalColor === 'b') && piece?.color === rivalColor;
}

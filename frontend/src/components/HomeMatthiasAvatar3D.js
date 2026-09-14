import * as THREE from 'three';

function material(color, options = {}) {
  const value = new THREE.MeshPhysicalMaterial({
    color,
    metalness: options.metalness ?? 0.05,
    roughness: options.roughness ?? 0.66,
    clearcoat: options.clearcoat ?? 0.08,
    clearcoatRoughness: options.clearcoatRoughness ?? 0.5,
    envMapIntensity: options.envMapIntensity ?? 0.26,
    specularIntensity: options.specularIntensity ?? 0.24,
  });
  value.userData.homeMatthiasOwnedMaterial = true;
  return value;
}

function add(parent, geometry, surface, position = [0, 0, 0], rotation = [0, 0, 0], scale = null, name = '') {
  const mesh = new THREE.Mesh(geometry, surface);
  mesh.position.set(...position);
  mesh.rotation.set(...rotation);
  if (scale) mesh.scale.set(...scale);
  if (name) mesh.name = name;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}

function lathe(parent, profile, surface, segments, name = '') {
  return add(
    parent,
    new THREE.LatheGeometry(profile.map(([radius, y]) => new THREE.Vector2(radius, y)), segments),
    surface,
    [0, 0, 0],
    [0, 0, 0],
    null,
    name,
  );
}

/**
 * Matthias in Home is a character first and a chess mascot second.
 *
 * Keep the approved face/cap language that makes him immediately recognisable,
 * but never reuse the rival-king silhouette: no king crown, no cross, no tall
 * lathed king body. The lower half is a compact officer/pawn mascot with real
 * shoulders and arms, while the head and plate cap carry Matthias' identity.
 */
export function buildHomeMatthiasAvatar3D({ coarsePointer = false } = {}) {
  const root = new THREE.Group();
  root.name = 'home-matthias-avatar';
  root.userData.homeMatthiasAvatar = true;
  root.userData.identity = 'canonical-officer-avatar-v2';
  root.userData.motionRig = 'portrait-head-and-body-v2';

  const segments = coarsePointer ? 24 : 42;
  const front = 1;

  const face = material(0xf2eadb, {
    metalness: 0,
    roughness: 0.82,
    clearcoat: 0.025,
    clearcoatRoughness: 0.82,
    envMapIntensity: 0.18,
    specularIntensity: 0.14,
  });
  const faceShadow = material(0xc1ad91, {
    metalness: 0,
    roughness: 0.92,
    clearcoat: 0.01,
    envMapIntensity: 0.1,
    specularIntensity: 0.08,
  });
  const uniform = material(0x171d24, {
    metalness: 0.1,
    roughness: 0.58,
    clearcoat: 0.12,
    clearcoatRoughness: 0.4,
    envMapIntensity: 0.34,
    specularIntensity: 0.3,
  });
  const uniformShadow = material(0x0d1116, {
    metalness: 0.08,
    roughness: 0.66,
    clearcoat: 0.08,
    envMapIntensity: 0.22,
    specularIntensity: 0.2,
  });
  const cap = material(0x10141a, {
    metalness: 0.16,
    roughness: 0.56,
    clearcoat: 0.12,
    envMapIntensity: 0.32,
    specularIntensity: 0.28,
  });
  const capBand = material(0x74272a, {
    metalness: 0.08,
    roughness: 0.68,
    clearcoat: 0.04,
    envMapIntensity: 0.16,
    specularIntensity: 0.14,
  });
  const brass = material(0xc99b3f, {
    metalness: 0.8,
    roughness: 0.28,
    clearcoat: 0.24,
    clearcoatRoughness: 0.22,
    envMapIntensity: 0.62,
    specularIntensity: 0.62,
  });
  const eyeWhite = material(0xd8d8d2, {
    metalness: 0,
    roughness: 0.88,
    clearcoat: 0.01,
    envMapIntensity: 0.08,
    specularIntensity: 0.06,
  });
  const ink = material(0x05070a, {
    metalness: 0.02,
    roughness: 0.78,
    clearcoat: 0.01,
    envMapIntensity: 0.08,
    specularIntensity: 0.08,
  });
  const sash = material(0x683235, {
    metalness: 0.04,
    roughness: 0.7,
    clearcoat: 0.03,
    envMapIntensity: 0.14,
    specularIntensity: 0.12,
  });

  // Restrained mascot plinth. It grounds Matthias but never turns him into a king.
  add(root, new THREE.CylinderGeometry(0.34, 0.38, 0.105, segments), uniformShadow, [0, 0.058, 0], [0, 0, 0], null, 'home-matthias-plinth');
  add(root, new THREE.TorusGeometry(0.342, 0.016, 8, segments), brass, [0, 0.112, 0], [Math.PI / 2, 0, 0], null, 'home-matthias-plinth-trim');

  const bodyRig = new THREE.Group();
  bodyRig.name = 'home-matthias-body-rig';
  bodyRig.userData.baseRotation = bodyRig.rotation.clone();
  root.add(bodyRig);

  // A compact officer coat: broad at the shoulders, gently tapered at the waist.
  // This keeps the canonical toy-soldier/pawn flavour without the rival king body.
  lathe(bodyRig, [
    [0.29, 0.11], [0.31, 0.16], [0.30, 0.22], [0.255, 0.30],
    [0.235, 0.42], [0.245, 0.58], [0.285, 0.70], [0.30, 0.755],
    [0.245, 0.805], [0.205, 0.83],
  ], uniform, segments, 'home-matthias-command-jacket');
  add(bodyRig, new THREE.TorusGeometry(0.19, 0.014, 8, segments), brass, [0, 0.814, 0], [Math.PI / 2, 0, 0], null, 'home-matthias-collar-trim');
  add(bodyRig, new THREE.BoxGeometry(0.072, 0.36, 0.024), sash, [-0.052, 0.56, 0.244], [0, 0, -0.42], null, 'home-matthias-sash');

  // Rounded shoulders and short arms make him read as a resident, not a chess glyph.
  add(bodyRig, new THREE.SphereGeometry(0.135, 18, 12), uniform, [-0.26, 0.70, 0.005], [0, 0, 0], [1.05, 0.75, 0.86], 'home-matthias-shoulder-left');
  add(bodyRig, new THREE.SphereGeometry(0.135, 18, 12), uniform, [0.26, 0.70, 0.005], [0, 0, 0], [1.05, 0.75, 0.86], 'home-matthias-shoulder-right');
  add(bodyRig, new THREE.CylinderGeometry(0.062, 0.072, 0.34, 16), uniformShadow, [-0.285, 0.50, 0.12], [0.18, 0, -0.18], null, 'home-matthias-arm-left');
  add(bodyRig, new THREE.CylinderGeometry(0.062, 0.072, 0.34, 16), uniformShadow, [0.285, 0.50, 0.12], [0.18, 0, 0.18], null, 'home-matthias-arm-right');
  add(bodyRig, new THREE.SphereGeometry(0.074, 16, 11), uniformShadow, [-0.245, 0.335, 0.17], [0, 0, 0], [1, 0.88, 0.9], 'home-matthias-glove-left');
  add(bodyRig, new THREE.SphereGeometry(0.074, 16, 11), uniformShadow, [0.245, 0.335, 0.17], [0, 0, 0], [1, 0.88, 0.9], 'home-matthias-glove-right');

  add(bodyRig, new THREE.BoxGeometry(0.17, 0.042, 0.075), brass, [-0.215, 0.765, 0.028], [0, 0, -0.06], null, 'home-matthias-epaulette-left');
  add(bodyRig, new THREE.BoxGeometry(0.17, 0.042, 0.075), brass, [0.215, 0.765, 0.028], [0, 0, 0.06], null, 'home-matthias-epaulette-right');
  add(bodyRig, new THREE.SphereGeometry(0.024, 12, 8), brass, [-0.10, 0.61, 0.255], [0, 0, 0], null, 'home-matthias-medal-left');
  add(bodyRig, new THREE.SphereGeometry(0.020, 12, 8), brass, [-0.04, 0.585, 0.258], [0, 0, 0], null, 'home-matthias-medal-right');
  for (const [index, y] of [0.67, 0.57, 0.47].entries()) {
    add(bodyRig, new THREE.SphereGeometry(0.016, 10, 7), brass, [0.065, y, 0.258], [0, 0, 0], null, `home-matthias-button-${index + 1}`);
  }

  const headRig = new THREE.Group();
  headRig.name = 'home-matthias-head-rig';
  headRig.userData.baseRotation = headRig.rotation.clone();
  headRig.userData.expression = 'command-fury-v3';
  root.add(headRig);

  // Reuse the approved proportions that already read as Matthias at tactical scale.
  add(headRig, new THREE.SphereGeometry(0.235, segments, coarsePointer ? 16 : 24), face, [0, 1.016, 0], [0, 0, 0], [1.06, 0.94, 0.94], 'home-matthias-face');
  const faceZ = front * 0.226;
  add(headRig, new THREE.SphereGeometry(0.036, 14, 9), eyeWhite, [-0.071, 1.028, faceZ], [0, 0, -0.16], [1.34, 0.42, 0.36], 'home-matthias-eye-white-left');
  add(headRig, new THREE.SphereGeometry(0.036, 14, 9), eyeWhite, [0.071, 1.028, faceZ], [0, 0, 0.16], [1.34, 0.42, 0.36], 'home-matthias-eye-white-right');
  add(headRig, new THREE.SphereGeometry(0.024, 14, 9), ink, [-0.069, 1.026, 0.233], [0, 0, -0.16], [1.2, 0.27, 0.30], 'home-matthias-eye-left');
  add(headRig, new THREE.SphereGeometry(0.024, 14, 9), ink, [0.069, 1.026, 0.233], [0, 0, 0.16], [1.2, 0.27, 0.30], 'home-matthias-eye-right');
  add(headRig, new THREE.BoxGeometry(0.112, 0.022, 0.02), ink, [-0.064, 1.071, 0.231], [0, 0, -0.55], null, 'home-matthias-brow-left');
  add(headRig, new THREE.BoxGeometry(0.112, 0.022, 0.02), ink, [0.064, 1.071, 0.231], [0, 0, 0.55], null, 'home-matthias-brow-right');
  add(headRig, new THREE.SphereGeometry(0.022, 14, 9), faceShadow, [0.004, 0.992, 0.236], [0, 0, 0], [0.62, 1.05, 0.46], 'home-matthias-nose');

  const mouthCurve = new THREE.QuadraticBezierCurve3(
    new THREE.Vector3(-0.056, 0.949, 0.233),
    new THREE.Vector3(0, 0.921, 0.239),
    new THREE.Vector3(0.056, 0.949, 0.233),
  );
  const mouth = add(
    headRig,
    new THREE.TubeGeometry(mouthCurve, coarsePointer ? 6 : 10, 0.0068, 6, false),
    ink,
    [0, 0, 0],
    [0, 0, 0],
    null,
    'home-matthias-mouth',
  );
  mouth.userData.expression = 'furious-downturn-v1';

  // Proper structured plate cap: tall flared crown, wine band, curved visor and
  // command crest. This is Matthias' strongest silhouette cue in the Home art.
  const capRig = new THREE.Group();
  capRig.name = 'home-matthias-officer-cap';
  capRig.position.set(0, 1.168, -0.003);
  capRig.rotation.z = -0.012;
  capRig.rotation.x = -0.026;
  capRig.userData.silhouette = 'home-hero-plate-cap';
  headRig.add(capRig);

  add(capRig, new THREE.CylinderGeometry(0.205, 0.212, 0.078, segments), cap, [0, 0.037, 0], [0, 0, 0], [1.02, 1, 0.94], 'home-matthias-cap');
  add(capRig, new THREE.CylinderGeometry(0.269, 0.207, 0.132, segments), cap, [-0.002, 0.141, -0.004], [0, 0, 0.008], [1.025, 1, 0.92], 'home-matthias-cap-crown');
  add(capRig, new THREE.CylinderGeometry(0.276, 0.268, 0.026, segments), cap, [-0.006, 0.226, -0.009], [0, 0, 0.018], [1.025, 1, 0.92], 'home-matthias-cap-top');
  add(capRig, new THREE.TorusGeometry(0.267, 0.0075, 8, segments), cap, [-0.004, 0.211, -0.007], [Math.PI / 2, 0, 0], [1.025, 0.92, 1], 'home-matthias-cap-crown-break');
  add(capRig, new THREE.CylinderGeometry(0.214, 0.216, 0.034, segments), capBand, [0, 0.058, 0.001], [0, 0, 0], [1.02, 1, 0.94], 'home-matthias-cap-band-fill');
  add(capRig, new THREE.TorusGeometry(0.213, 0.0085, 8, segments), brass, [0, 0.077, 0.002], [Math.PI / 2, 0, 0], [1.02, 0.94, 1], 'home-matthias-cap-band');
  add(capRig, new THREE.TorusGeometry(0.271, 0.0055, 7, segments), capBand, [-0.006, 0.237, -0.009], [Math.PI / 2, 0, 0], [1.025, 0.92, 1], 'home-matthias-cap-red-piping');

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
    capRig,
    visorGeometry,
    cap,
    [0, -0.004, 0.137],
    [Math.PI / 2 - 0.052, 0, 0],
    null,
    'home-matthias-cap-visor',
  );
  visor.userData.shortPremiumBrim = true;

  const cordCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(-0.162, 0.068, 0.195),
    new THREE.Vector3(-0.083, 0.057, 0.214),
    new THREE.Vector3(0, 0.052, 0.22),
    new THREE.Vector3(0.083, 0.057, 0.214),
    new THREE.Vector3(0.162, 0.068, 0.195),
  ]);
  add(capRig, new THREE.TubeGeometry(cordCurve, coarsePointer ? 12 : 22, 0.0072, 7, false), brass, [0, 0, 0], [0, 0, 0], null, 'home-matthias-cap-cord');
  add(capRig, new THREE.SphereGeometry(0.013, 10, 7), brass, [-0.168, 0.071, 0.194], [0, 0, 0], null, 'home-matthias-cap-cord-stud-left');
  add(capRig, new THREE.SphereGeometry(0.013, 10, 7), brass, [0.168, 0.071, 0.194], [0, 0, 0], null, 'home-matthias-cap-cord-stud-right');
  add(capRig, new THREE.BoxGeometry(0.072, 0.076, 0.014), brass, [0, 0.119, 0.214], [0, 0, Math.PI / 4], [1, 1.12, 1], 'home-matthias-cap-badge');
  add(capRig, new THREE.BoxGeometry(0.048, 0.052, 0.016), ink, [0, 0.119, 0.223], [0, 0, Math.PI / 4], [1, 1.08, 1], 'home-matthias-cap-badge-inset');
  add(capRig, new THREE.BoxGeometry(0.023, 0.025, 0.018), capBand, [0, 0.119, 0.234], [0, 0, Math.PI / 4], [1, 1.05, 1], 'home-matthias-cap-badge-gem');

  root.scale.setScalar(1.06);
  return root;
}

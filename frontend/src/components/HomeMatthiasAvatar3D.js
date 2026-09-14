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

/**
 * Home Matthias is an avatar, not the rival king chess piece.
 *
 * The silhouette follows the canonical portrait used around the product:
 * oversized pale round face, severe brows, proper peaked officer cap, compact
 * black command tunic, burgundy accents and restrained brass. The chess-piece
 * base is only a small visual plinth; there is deliberately no king crown,
 * cross or lathed king body here.
 */
export function buildHomeMatthiasAvatar3D({ coarsePointer = false } = {}) {
  const root = new THREE.Group();
  root.name = 'home-matthias-avatar';
  root.userData.homeMatthiasAvatar = true;
  root.userData.identity = 'canonical-officer-avatar-v1';
  root.userData.motionRig = 'portrait-head-and-body-v1';

  const segments = coarsePointer ? 22 : 36;
  const skin = material(0xe9d8bd, {
    metalness: 0,
    roughness: 0.86,
    clearcoat: 0.015,
    envMapIntensity: 0.12,
    specularIntensity: 0.1,
  });
  const skinShadow = material(0xba9874, {
    metalness: 0,
    roughness: 0.92,
    clearcoat: 0,
    envMapIntensity: 0.08,
    specularIntensity: 0.06,
  });
  const uniform = material(0x10151b, {
    metalness: 0.12,
    roughness: 0.57,
    clearcoat: 0.16,
    clearcoatRoughness: 0.36,
    envMapIntensity: 0.38,
    specularIntensity: 0.34,
  });
  const uniformSoft = material(0x1e252c, {
    metalness: 0.07,
    roughness: 0.68,
    clearcoat: 0.06,
    envMapIntensity: 0.24,
  });
  const burgundy = material(0x74272b, {
    metalness: 0.06,
    roughness: 0.66,
    clearcoat: 0.08,
    envMapIntensity: 0.2,
  });
  const brass = material(0xc99a42, {
    metalness: 0.82,
    roughness: 0.27,
    clearcoat: 0.22,
    clearcoatRoughness: 0.2,
    envMapIntensity: 0.62,
    specularIntensity: 0.58,
  });
  const ink = material(0x030507, {
    metalness: 0,
    roughness: 0.82,
    clearcoat: 0,
    envMapIntensity: 0.06,
    specularIntensity: 0.05,
  });
  const eyeWhite = material(0xe8e4d9, {
    metalness: 0,
    roughness: 0.92,
    clearcoat: 0,
    envMapIntensity: 0.05,
    specularIntensity: 0.04,
  });

  // Small plinth only. Matthias must read as a character before he reads as a
  // chess object, unlike MatthiasKing3D in the War Room.
  add(root, new THREE.CylinderGeometry(0.39, 0.43, 0.12, segments), uniform, [0, 0.075, 0], [0, 0, 0], null, 'home-matthias-plinth');
  add(root, new THREE.TorusGeometry(0.385, 0.018, 8, segments), brass, [0, 0.132, 0], [Math.PI / 2, 0, 0], null, 'home-matthias-plinth-trim');

  const bodyRig = new THREE.Group();
  bodyRig.name = 'home-matthias-body-rig';
  bodyRig.userData.baseRotation = bodyRig.rotation.clone();
  root.add(bodyRig);

  // Compact rounded military torso, broad shoulders and visible arms.
  add(bodyRig, new THREE.SphereGeometry(0.42, segments, coarsePointer ? 14 : 22), uniform, [0, 0.52, 0], [0, 0, 0], [0.92, 1.02, 0.72], 'home-matthias-command-jacket');
  add(bodyRig, new THREE.BoxGeometry(0.42, 0.43, 0.055), uniformSoft, [0, 0.54, 0.292], [0, 0, 0], null, 'home-matthias-jacket-front');
  add(bodyRig, new THREE.BoxGeometry(0.055, 0.5, 0.026), burgundy, [-0.06, 0.55, 0.329], [0, 0, -0.42], null, 'home-matthias-sash');

  add(bodyRig, new THREE.SphereGeometry(0.15, 20, 14), uniform, [-0.31, 0.67, 0.015], [0, 0, 0], [1.0, 0.78, 0.82], 'home-matthias-shoulder-left');
  add(bodyRig, new THREE.SphereGeometry(0.15, 20, 14), uniform, [0.31, 0.67, 0.015], [0, 0, 0], [1.0, 0.78, 0.82], 'home-matthias-shoulder-right');
  add(bodyRig, new THREE.BoxGeometry(0.19, 0.045, 0.09), brass, [-0.29, 0.79, 0.02], [0, 0, -0.05], null, 'home-matthias-epaulette-left');
  add(bodyRig, new THREE.BoxGeometry(0.19, 0.045, 0.09), brass, [0.29, 0.79, 0.02], [0, 0, 0.05], null, 'home-matthias-epaulette-right');

  const armGeometry = new THREE.CylinderGeometry(0.075, 0.085, 0.43, 16);
  add(bodyRig, armGeometry, uniformSoft, [-0.315, 0.47, 0.205], [0.22, 0, -0.25], null, 'home-matthias-arm-left');
  add(bodyRig, armGeometry.clone(), uniformSoft, [0.315, 0.47, 0.205], [0.22, 0, 0.25], null, 'home-matthias-arm-right');
  add(bodyRig, new THREE.SphereGeometry(0.084, 18, 12), uniform, [-0.255, 0.28, 0.265], [0, 0, 0], [1, 0.9, 0.85], 'home-matthias-glove-left');
  add(bodyRig, new THREE.SphereGeometry(0.084, 18, 12), uniform, [0.255, 0.28, 0.265], [0, 0, 0], [1, 0.9, 0.85], 'home-matthias-glove-right');

  // Officer details survive at Home scale without turning into RPG clutter.
  add(bodyRig, new THREE.TorusGeometry(0.19, 0.012, 7, segments), brass, [0, 0.825, 0], [Math.PI / 2, 0, 0], [1.0, 0.78, 1], 'home-matthias-collar-trim');
  for (const y of [0.65, 0.54, 0.43]) {
    add(bodyRig, new THREE.SphereGeometry(0.022, 12, 8), brass, [0.055, y, 0.334], [0, 0, 0], null, `home-matthias-button-${String(y).replace('.', '-')}`);
  }
  add(bodyRig, new THREE.BoxGeometry(0.065, 0.065, 0.018), brass, [-0.135, 0.66, 0.34], [0, 0, Math.PI / 4], null, 'home-matthias-medal');
  add(bodyRig, new THREE.BoxGeometry(0.032, 0.032, 0.022), burgundy, [-0.135, 0.66, 0.353], [0, 0, Math.PI / 4], null, 'home-matthias-medal-inset');

  const headRig = new THREE.Group();
  headRig.name = 'home-matthias-head-rig';
  headRig.userData.baseRotation = headRig.rotation.clone();
  root.add(headRig);

  // The large round face is Matthias' most important identifying feature.
  add(headRig, new THREE.SphereGeometry(0.29, segments, coarsePointer ? 16 : 24), skin, [0, 1.08, 0.02], [0, 0, 0], [1.06, 0.96, 0.91], 'home-matthias-face');
  add(headRig, new THREE.SphereGeometry(0.045, 14, 9), skinShadow, [0.004, 1.045, 0.289], [0, 0, 0], [0.58, 1.02, 0.46], 'home-matthias-nose');

  const faceZ = 0.279;
  add(headRig, new THREE.SphereGeometry(0.042, 14, 9), eyeWhite, [-0.09, 1.105, faceZ], [0, 0, -0.12], [1.4, 0.45, 0.34], 'home-matthias-eye-white-left');
  add(headRig, new THREE.SphereGeometry(0.042, 14, 9), eyeWhite, [0.09, 1.105, faceZ], [0, 0, 0.12], [1.4, 0.45, 0.34], 'home-matthias-eye-white-right');
  add(headRig, new THREE.SphereGeometry(0.026, 12, 8), ink, [-0.088, 1.103, 0.292], [0, 0, 0], [1.0, 0.42, 0.34], 'home-matthias-eye-left');
  add(headRig, new THREE.SphereGeometry(0.026, 12, 8), ink, [0.088, 1.103, 0.292], [0, 0, 0], [1.0, 0.42, 0.34], 'home-matthias-eye-right');

  add(headRig, new THREE.BoxGeometry(0.135, 0.024, 0.022), ink, [-0.078, 1.158, 0.292], [0, 0, -0.38], null, 'home-matthias-brow-left');
  add(headRig, new THREE.BoxGeometry(0.135, 0.024, 0.022), ink, [0.078, 1.158, 0.292], [0, 0, 0.38], null, 'home-matthias-brow-right');

  const mouthCurve = new THREE.QuadraticBezierCurve3(
    new THREE.Vector3(-0.064, 1.002, 0.292),
    new THREE.Vector3(0, 0.976, 0.3),
    new THREE.Vector3(0.064, 1.002, 0.292),
  );
  add(headRig, new THREE.TubeGeometry(mouthCurve, coarsePointer ? 6 : 10, 0.0065, 6, false), ink, [0, 0, 0], [0, 0, 0], null, 'home-matthias-mouth');

  // Canonical peaked officer cap. No king crown, finial or chess cross.
  const capRig = new THREE.Group();
  capRig.name = 'home-matthias-officer-cap';
  capRig.position.set(0, 1.29, 0);
  capRig.rotation.x = -0.018;
  headRig.add(capRig);

  add(capRig, new THREE.CylinderGeometry(0.235, 0.245, 0.075, segments), uniform, [0, 0.035, 0], [0, 0, 0], [1.0, 1, 0.94], 'home-matthias-cap-band');
  add(capRig, new THREE.CylinderGeometry(0.285, 0.235, 0.13, segments), uniform, [0, 0.13, -0.008], [0, 0, 0], [1.03, 1, 0.92], 'home-matthias-cap-crown');
  add(capRig, new THREE.CylinderGeometry(0.29, 0.282, 0.025, segments), uniform, [-0.006, 0.205, -0.014], [0, 0, 0.015], [1.03, 1, 0.92], 'home-matthias-cap-top');
  add(capRig, new THREE.CylinderGeometry(0.245, 0.247, 0.032, segments), burgundy, [0, 0.053, 0.003], [0, 0, 0], [1.0, 1, 0.94], 'home-matthias-cap-red-band');
  add(capRig, new THREE.BoxGeometry(0.31, 0.035, 0.14), uniform, [0, -0.005, 0.205], [-0.11, 0, 0], [1.0, 1, 0.76], 'home-matthias-cap-visor');
  add(capRig, new THREE.BoxGeometry(0.075, 0.075, 0.018), brass, [0, 0.105, 0.228], [0, 0, Math.PI / 4], null, 'home-matthias-cap-badge');
  add(capRig, new THREE.BoxGeometry(0.034, 0.034, 0.022), burgundy, [0, 0.105, 0.241], [0, 0, Math.PI / 4], null, 'home-matthias-cap-badge-inset');
  add(capRig, new THREE.TorusGeometry(0.195, 0.007, 7, 24, Math.PI), brass, [0, 0.03, 0.226], [Math.PI / 2, 0, 0], [1.0, 0.72, 1], 'home-matthias-cap-cord');

  root.scale.setScalar(0.96);
  return root;
}

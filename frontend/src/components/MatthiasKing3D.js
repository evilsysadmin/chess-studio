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
 * Matthias es el rey reglamentario del bando rival y, por tanto, su cuerpo
 * debe leerse primero como una pieza de ese color. La identidad la ponen la
 * cara permanentemente cabreada y la gorra de plato, no un uniforme negro que
 * pueda confundir una pieza blanca con una negra.
 */
export function buildMatthiasKing3D(mainMaterial, accentMaterial, { coarsePointer = false, faceTowardCamera = true } = {}) {
  const group = new THREE.Group();
  group.name = 'matthias-rival-king';
  group.userData.matthiasKing = true;

  const segments = coarsePointer ? 24 : 42;
  const front = faceTowardCamera ? 1 : -1;
  const face = mat(0xc89b6b, {
    metalness: 0,
    roughness: 0.8,
    clearcoat: 0.025,
    clearcoatRoughness: 0.82,
    envMapIntensity: 0.18,
    specularIntensity: 0.15,
  });
  const cap = mat(0x11151b, {
    metalness: 0.16,
    roughness: 0.58,
    clearcoat: 0.1,
    envMapIntensity: 0.3,
    specularIntensity: 0.26,
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

  // Cuerpo de rey clásico: peana ancha, cintura y hombros altos. Todo usa el
  // material del bando para que un Matthias blanco sea inequívocamente marfil.
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

  // Cara de Matthias: grande, mate, ceño muy marcado y boca torcida hacia abajo.
  add(group, new THREE.SphereGeometry(0.235, segments, coarsePointer ? 16 : 24), face, [0, 0.985, 0], [0, 0, 0], [1.04, 0.96, 0.95], 'matthias-face');
  const faceZ = front * 0.218;
  add(group, new THREE.SphereGeometry(0.03, 14, 9), ink, [-0.078, 0.995, faceZ], [0, 0, 0], [1.18, 0.78, 0.54], 'matthias-eye-left');
  add(group, new THREE.SphereGeometry(0.03, 14, 9), ink, [0.078, 0.995, faceZ], [0, 0, 0], [1.18, 0.78, 0.54], 'matthias-eye-right');
  add(group, new THREE.BoxGeometry(0.112, 0.024, 0.022), ink, [-0.073, 1.043, front * 0.223], [0, 0, -0.32 * front], null, 'matthias-brow-left');
  add(group, new THREE.BoxGeometry(0.112, 0.024, 0.022), ink, [0.073, 1.043, front * 0.223], [0, 0, 0.32 * front], null, 'matthias-brow-right');
  add(group, new THREE.SphereGeometry(0.025, 12, 8), face, [0, 0.956, front * 0.232], [0, 0, 0], [0.86, 1, 0.66], 'matthias-nose');
  add(group, new THREE.BoxGeometry(0.075, 0.017, 0.02), ink, [-0.032, 0.907, front * 0.227], [0, 0, 0.16 * front], null, 'matthias-mouth-left');
  add(group, new THREE.BoxGeometry(0.075, 0.017, 0.02), ink, [0.032, 0.907, front * 0.227], [0, 0, -0.16 * front], null, 'matthias-mouth-right');

  // Gorra de plato: firma visual, pero ahora corona un cuerpo de rey normal en
  // vez de convertir toda la pieza en un peón militar oscuro.
  add(group, new THREE.CylinderGeometry(0.248, 0.268, 0.13, segments), cap, [0, 1.18, 0], [0, 0, 0], [1.08, 1, 0.91], 'matthias-cap');
  add(group, new THREE.TorusGeometry(0.245, 0.024, 8, segments), capBand, [0, 1.13, 0], [Math.PI / 2, 0, 0], [1.04, 0.9, 1], 'matthias-cap-band');
  add(group, new THREE.TorusGeometry(0.249, 0.011, 8, segments), brass, [0, 1.145, 0], [Math.PI / 2, 0, 0], [1.04, 0.9, 1], 'matthias-cap-piping');
  add(group, new THREE.CylinderGeometry(0.228, 0.244, 0.058, segments), cap, [0, 1.267, 0], [0, 0, 0], [1.12, 1, 0.92], 'matthias-cap-top');
  add(group, new THREE.BoxGeometry(0.37, 0.035, 0.155), cap, [0, 1.135, front * 0.205], [-0.09 * front, 0, 0], [1.16, 1, 1], 'matthias-visor');
  add(group, new THREE.SphereGeometry(0.055, 14, 9), brass, [0, 1.22, front * 0.236], [0, 0, 0], null, 'matthias-cap-badge');
  add(group, new THREE.BoxGeometry(0.021, 0.086, 0.016), ink, [0, 1.22, front * 0.286], [0, 0, 0], null, 'matthias-cap-badge-vertical');
  add(group, new THREE.BoxGeometry(0.078, 0.021, 0.016), ink, [0, 1.22, front * 0.286], [0, 0, 0], null, 'matthias-cap-badge-horizontal');

  group.scale.setScalar(1.03);
  return group;
}

export function isMatthiasRivalKing(piece, rivalColor) {
  return piece?.type === 'k' && (rivalColor === 'w' || rivalColor === 'b') && piece?.color === rivalColor;
}

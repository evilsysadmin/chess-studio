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
  const material = new THREE.MeshPhysicalMaterial({
    color,
    metalness: options.metalness ?? 0.08,
    roughness: options.roughness ?? 0.62,
    clearcoat: options.clearcoat ?? 0.12,
    clearcoatRoughness: options.clearcoatRoughness ?? 0.42,
    envMapIntensity: options.envMapIntensity ?? 0.36,
    specularIntensity: options.specularIntensity ?? 0.34,
  });
  material.userData.matthiasOwnedMaterial = true;
  return material;
}

/**
 * Matthias sigue siendo legalmente el rey de la partida, pero visualmente es
 * Matthias: un peón-general reconocible incluso cuando el tablero ocupa pocos
 * píxeles en móvil. La peana conserva el color reglamentario del bando rival.
 */
export function buildMatthiasKing3D(mainMaterial, accentMaterial, { coarsePointer = false, faceTowardCamera = true } = {}) {
  const group = new THREE.Group();
  group.name = 'matthias-rival-king';
  group.userData.matthiasKing = true;

  const segments = coarsePointer ? 24 : 40;
  const uniform = mat(0x14191f, { metalness: 0.18, roughness: 0.62, clearcoat: 0.08, envMapIntensity: 0.3, specularIntensity: 0.24 });
  const cap = mat(0x090d12, { metalness: 0.22, roughness: 0.54, clearcoat: 0.1, envMapIntensity: 0.34, specularIntensity: 0.28 });
  const face = mat(0xc39361, { metalness: 0, roughness: 0.8, clearcoat: 0.02, clearcoatRoughness: 0.8, envMapIntensity: 0.16, specularIntensity: 0.14 });
  const brass = mat(0xc39238, { metalness: 0.78, roughness: 0.31, clearcoat: 0.22, clearcoatRoughness: 0.24, envMapIntensity: 0.58, specularIntensity: 0.58 });
  const black = mat(0x05070a, { metalness: 0.04, roughness: 0.76, clearcoat: 0.01, envMapIntensity: 0.08, specularIntensity: 0.08 });
  const piping = mat(0x7f2929, { metalness: 0.08, roughness: 0.68, clearcoat: 0.04, envMapIntensity: 0.18, specularIntensity: 0.14 });

  const front = faceTowardCamera ? 1 : -1;

  // Peana reglamentaria: sigue leyendo como la pieza de ese bando aunque el
  // uniforme de Matthias sea siempre el suyo.
  const baseProfile = [
    [0.37, 0], [0.4, 0.04], [0.4, 0.09], [0.34, 0.135],
    [0.31, 0.18], [0.255, 0.22], [0.24, 0.27], [0.205, 0.31],
  ];
  lathe(group, baseProfile, mainMaterial, segments, 'matthias-side-base');
  add(group, new THREE.TorusGeometry(0.28, 0.028, 10, segments), accentMaterial, [0, 0.205, 0], [Math.PI / 2, 0, 0], null, 'matthias-side-ring');

  // Torso de peón, algo más ancho que el resto para que la silueta militar se
  // lea sin necesidad de acercar la cámara.
  const torsoProfile = [
    [0.21, 0.29], [0.2, 0.37], [0.18, 0.49], [0.205, 0.59],
    [0.225, 0.66], [0.2, 0.71],
  ];
  lathe(group, torsoProfile, uniform, segments, 'matthias-uniform');
  add(group, new THREE.TorusGeometry(0.195, 0.023, 10, segments), piping, [0, 0.57, 0], [Math.PI / 2, 0, 0], null, 'matthias-uniform-piping');
  add(group, new THREE.TorusGeometry(0.17, 0.018, 9, segments), brass, [0, 0.69, 0], [Math.PI / 2, 0, 0], null, 'matthias-collar');

  // Hombreras y pecho. El medallón frontal grande también ayuda a distinguirlo
  // de un rey clásico negro cuando la escena se ve a tamaño Android.
  add(group, new THREE.BoxGeometry(0.23, 0.065, 0.17), brass, [-0.235, 0.6, 0], [0, 0, -0.04], null, 'matthias-epaulette-left');
  add(group, new THREE.BoxGeometry(0.23, 0.065, 0.17), brass, [0.235, 0.6, 0], [0, 0, 0.04], null, 'matthias-epaulette-right');
  add(group, new THREE.BoxGeometry(0.065, 0.205, 0.03), brass, [0, 0.49, front * 0.205], [0, 0, 0], null, 'matthias-insignia');
  add(group, new THREE.BoxGeometry(0.175, 0.058, 0.03), brass, [0, 0.51, front * 0.205], [0, 0, 0], null, 'matthias-chest-bar');
  add(group, new THREE.SphereGeometry(0.047, 14, 10), piping, [0, 0.55, front * 0.221], [0, 0, 0], null, 'matthias-medal-center');

  // Cabeza grande, plana de brillo y con rasgos enfadados siempre presentes.
  // Antes se omitían cejas/boca en coarse pointer, justo donde más falta hacían.
  add(group, new THREE.SphereGeometry(0.238, segments, coarsePointer ? 16 : 24), face, [0, 0.82, 0], [0, 0, 0], [1.03, 0.96, 0.94], 'matthias-face');
  const eyeZ = front * 0.218;
  const eyeY = 0.83;
  add(group, new THREE.SphereGeometry(0.031, 14, 9), black, [-0.078, eyeY, eyeZ], [0, 0, 0], [1.18, 0.78, 0.52], 'matthias-eye-left');
  add(group, new THREE.SphereGeometry(0.031, 14, 9), black, [0.078, eyeY, eyeZ], [0, 0, 0], [1.18, 0.78, 0.52], 'matthias-eye-right');
  add(group, new THREE.BoxGeometry(0.112, 0.024, 0.022), black, [-0.073, 0.878, front * 0.222], [0, 0, -0.3 * front], null, 'matthias-brow-left');
  add(group, new THREE.BoxGeometry(0.112, 0.024, 0.022), black, [0.073, 0.878, front * 0.222], [0, 0, 0.3 * front], null, 'matthias-brow-right');
  add(group, new THREE.SphereGeometry(0.025, 12, 8), face, [0, 0.79, front * 0.232], [0, 0, 0], [0.85, 1.0, 0.65], 'matthias-nose');
  add(group, new THREE.BoxGeometry(0.072, 0.017, 0.02), black, [-0.031, 0.742, front * 0.226], [0, 0, 0.14 * front], null, 'matthias-mouth-left');
  add(group, new THREE.BoxGeometry(0.072, 0.017, 0.02), black, [0.031, 0.742, front * 0.226], [0, 0, -0.14 * front], null, 'matthias-mouth-right');

  // Gorra de plato sobredimensionada a propósito: es la firma visual de Matthias.
  add(group, new THREE.CylinderGeometry(0.25, 0.27, 0.135, segments), cap, [0, 1.015, 0], [0, 0, 0], [1.08, 1, 0.91], 'matthias-cap');
  add(group, new THREE.TorusGeometry(0.247, 0.025, 8, segments), piping, [0, 0.962, 0], [Math.PI / 2, 0, 0], [1.04, 0.9, 1], 'matthias-cap-band');
  add(group, new THREE.TorusGeometry(0.251, 0.012, 8, segments), brass, [0, 0.977, 0], [Math.PI / 2, 0, 0], [1.04, 0.9, 1], 'matthias-cap-piping');
  add(group, new THREE.CylinderGeometry(0.23, 0.245, 0.06, segments), cap, [0, 1.105, 0], [0, 0, 0], [1.12, 1, 0.92], 'matthias-cap-top');
  add(group, new THREE.BoxGeometry(0.37, 0.035, 0.155), cap, [0, 0.967, front * 0.205], [-0.09 * front, 0, 0], [1.16, 1, 1], 'matthias-visor');
  add(group, new THREE.SphereGeometry(0.056, 14, 9), brass, [0, 1.055, front * 0.236], [0, 0, 0], null, 'matthias-cap-badge');
  add(group, new THREE.BoxGeometry(0.022, 0.09, 0.016), black, [0, 1.055, front * 0.286], [0, 0, 0], null, 'matthias-cap-badge-vertical');
  add(group, new THREE.BoxGeometry(0.082, 0.022, 0.016), black, [0, 1.055, front * 0.286], [0, 0, 0], null, 'matthias-cap-badge-horizontal');

  group.scale.setScalar(1.11);
  return group;
}

export function isMatthiasRivalKing(piece, rivalColor) {
  return piece?.type === 'k' && (rivalColor === 'w' || rivalColor === 'b') && piece?.color === rivalColor;
}

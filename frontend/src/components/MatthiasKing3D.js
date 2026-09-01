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
 * Matthias: peón militar, uniforme oscuro, cara beige, gorra de plato y latón.
 * La peana conserva el color del bando para que nunca haya duda reglamentaria.
 */
export function buildMatthiasKing3D(mainMaterial, accentMaterial, { coarsePointer = false, faceTowardCamera = true } = {}) {
  const group = new THREE.Group();
  group.name = 'matthias-rival-king';
  group.userData.matthiasKing = true;

  const segments = coarsePointer ? 20 : 36;
  const uniform = mat(0x171b20, { metalness: 0.22, roughness: 0.58, clearcoat: 0.1, envMapIntensity: 0.34, specularIntensity: 0.28 });
  const cap = mat(0x0d1116, { metalness: 0.28, roughness: 0.5, clearcoat: 0.12, envMapIntensity: 0.38, specularIntensity: 0.3 });
  const face = mat(0xb58b5b, { metalness: 0, roughness: 0.82, clearcoat: 0.03, clearcoatRoughness: 0.75, envMapIntensity: 0.18, specularIntensity: 0.16 });
  const brass = mat(0xb88a35, { metalness: 0.78, roughness: 0.3, clearcoat: 0.28, clearcoatRoughness: 0.22, envMapIntensity: 0.62, specularIntensity: 0.64 });
  const black = mat(0x07090c, { metalness: 0.08, roughness: 0.7, clearcoat: 0.02, envMapIntensity: 0.12, specularIntensity: 0.12 });

  // Peana del bando: Matthias puede vestir de negro, pero sigue perteneciendo
  // inequívocamente al color rival a efectos visuales y reglamentarios.
  const baseProfile = [
    [0.36, 0], [0.39, 0.04], [0.39, 0.09], [0.33, 0.135],
    [0.3, 0.18], [0.25, 0.22], [0.235, 0.27], [0.2, 0.31],
  ];
  lathe(group, baseProfile, mainMaterial, segments, 'matthias-side-base');
  add(group, new THREE.TorusGeometry(0.27, 0.026, 10, segments), accentMaterial, [0, 0.205, 0], [Math.PI / 2, 0, 0], null, 'matthias-side-ring');

  // Cuerpo de peón militar, no de rey clásico.
  const torsoProfile = [
    [0.205, 0.29], [0.19, 0.38], [0.17, 0.49], [0.19, 0.58],
    [0.21, 0.65], [0.19, 0.7],
  ];
  lathe(group, torsoProfile, uniform, segments, 'matthias-uniform');
  add(group, new THREE.TorusGeometry(0.19, 0.022, 10, segments), brass, [0, 0.57, 0], [Math.PI / 2, 0, 0]);

  // Hombreras y condecoración frontal, legibles incluso con cámara alejada.
  add(group, new THREE.BoxGeometry(0.2, 0.055, 0.14), brass, [-0.22, 0.58, 0]);
  add(group, new THREE.BoxGeometry(0.2, 0.055, 0.14), brass, [0.22, 0.58, 0]);
  const front = faceTowardCamera ? 1 : -1;
  add(group, new THREE.BoxGeometry(0.055, 0.19, 0.025), brass, [0, 0.48, front * 0.19], [0, 0, 0], null, 'matthias-insignia');
  add(group, new THREE.BoxGeometry(0.15, 0.052, 0.025), brass, [0, 0.5, front * 0.19]);

  // Cara característica de Matthias.
  add(group, new THREE.SphereGeometry(0.215, segments, coarsePointer ? 14 : 22), face, [0, 0.79, 0], [0, 0, 0], null, 'matthias-face');
  const eyeZ = front * 0.196;
  const eyeY = 0.81;
  add(group, new THREE.SphereGeometry(0.025, 12, 8), black, [-0.072, eyeY, eyeZ], [0, 0, 0], [1.15, 0.8, 0.55]);
  add(group, new THREE.SphereGeometry(0.025, 12, 8), black, [0.072, eyeY, eyeZ], [0, 0, 0], [1.15, 0.8, 0.55]);
  if (!coarsePointer) {
    add(group, new THREE.BoxGeometry(0.09, 0.018, 0.018), black, [-0.066, 0.855, front * 0.202], [0, 0, -0.28 * front]);
    add(group, new THREE.BoxGeometry(0.09, 0.018, 0.018), black, [0.066, 0.855, front * 0.202], [0, 0, 0.28 * front]);
    add(group, new THREE.BoxGeometry(0.105, 0.014, 0.018), black, [0, 0.73, front * 0.207], [0, 0, 0.06 * front]);
  }

  // Gorra de plato: ésta es la pieza que hace que deje de parecer "otro rey".
  add(group, new THREE.CylinderGeometry(0.225, 0.245, 0.13, segments), cap, [0, 0.99, 0], [0, 0, 0], [1.08, 1, 0.9], 'matthias-cap');
  add(group, new THREE.TorusGeometry(0.225, 0.022, 8, segments), brass, [0, 0.935, 0], [Math.PI / 2, 0, 0], [1.03, 0.88, 1]);
  add(group, new THREE.CylinderGeometry(0.205, 0.225, 0.055, segments), cap, [0, 1.07, 0], [0, 0, 0], [1.1, 1, 0.91]);
  add(group, new THREE.BoxGeometry(0.32, 0.03, 0.14), cap, [0, 0.94, front * 0.19], [-0.08 * front, 0, 0], [1.18, 1, 1], 'matthias-visor');
  add(group, new THREE.SphereGeometry(0.047, 12, 8), brass, [0, 1.025, front * 0.213], [0, 0, 0], null, 'matthias-cap-badge');
  add(group, new THREE.TorusGeometry(0.058, 0.01, 7, 18), brass, [0, 1.025, front * 0.215], [Math.PI / 2, 0, 0]);

  group.scale.setScalar(1.03);
  return group;
}

export function isMatthiasRivalKing(piece, rivalColor) {
  return piece?.type === 'k' && (rivalColor === 'w' || rivalColor === 'b') && piece?.color === rivalColor;
}

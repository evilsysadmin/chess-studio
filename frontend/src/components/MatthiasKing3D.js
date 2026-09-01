import * as THREE from 'three';

function add(group, geometry, material, position = [0, 0, 0], rotation = [0, 0, 0], scale = null) {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(...position);
  mesh.rotation.set(...rotation);
  if (scale) mesh.scale.set(...scale);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  group.add(mesh);
  return mesh;
}

function lathe(group, profile, material, segments) {
  return add(
    group,
    new THREE.LatheGeometry(profile.map(([radius, y]) => new THREE.Vector2(radius, y)), segments),
    material,
  );
}

/**
 * Matthias sigue siendo legalmente el rey de la partida, pero visualmente
 * conserva su identidad de peón militar: base/torso de peón, cabeza redonda,
 * gorra de plato, visera y distintivo frontal. No se reutiliza una silueta de
 * rey estándar porque justo la gracia es que el comandante se niega a dejar
 * de ser peón aunque el motor lo trate como K.
 */
export function buildMatthiasKing3D(mainMaterial, accentMaterial, { coarsePointer = false, faceTowardCamera = true } = {}) {
  const group = new THREE.Group();
  group.name = 'matthias-rival-king';
  group.userData.matthiasKing = true;

  const segments = coarsePointer ? 20 : 36;
  const bodyProfile = [
    [0.34, 0], [0.37, 0.04], [0.37, 0.09], [0.31, 0.13], [0.29, 0.18],
    [0.23, 0.21], [0.22, 0.27], [0.18, 0.31],
    [0.17, 0.4], [0.145, 0.52], [0.17, 0.59],
  ];
  lathe(group, bodyProfile, mainMaterial, segments);
  add(group, new THREE.TorusGeometry(0.245, 0.022, 10, segments), accentMaterial, [0, 0.2, 0], [Math.PI / 2, 0, 0]);
  add(group, new THREE.TorusGeometry(0.16, 0.024, 10, segments), accentMaterial, [0, 0.58, 0], [Math.PI / 2, 0, 0]);

  // Cabeza de peón, deliberadamente más grande que la del peón de tropa.
  add(group, new THREE.SphereGeometry(0.205, segments, coarsePointer ? 14 : 22), mainMaterial, [0, 0.76, 0]);

  // Gorra militar: copa ovalada, banda, visera y placa de peón.
  add(group, new THREE.CylinderGeometry(0.22, 0.245, 0.135, segments), mainMaterial, [0, 0.95, 0], [0, 0, 0], [1.04, 1, 0.88]);
  add(group, new THREE.TorusGeometry(0.225, 0.022, 8, segments), accentMaterial, [0, 0.9, 0], [Math.PI / 2, 0, 0], [1.03, 0.88, 1]);
  add(group, new THREE.CylinderGeometry(0.205, 0.22, 0.055, segments), mainMaterial, [0, 1.03, 0], [0, 0, 0], [1.08, 1, 0.9]);

  const frontZ = faceTowardCamera ? 0.19 : -0.19;
  add(group, new THREE.BoxGeometry(0.29, 0.025, 0.13), accentMaterial, [0, 0.9, frontZ], [0.08 * (faceTowardCamera ? -1 : 1), 0, 0], [1.2, 1, 1]);
  add(group, new THREE.SphereGeometry(0.043, 12, 8), accentMaterial, [0, 0.985, faceTowardCamera ? 0.205 : -0.205]);
  add(group, new THREE.TorusGeometry(0.055, 0.01, 7, 18), accentMaterial, [0, 0.985, faceTowardCamera ? 0.207 : -0.207], [Math.PI / 2, 0, 0]);

  // Hombreras/collar mínimo para que la lectura sea "comandante" incluso
  // cuando la cámara está lejos, sin convertir la pieza en una miniatura RPG.
  add(group, new THREE.BoxGeometry(0.18, 0.045, 0.12), accentMaterial, [-0.22, 0.52, 0]);
  add(group, new THREE.BoxGeometry(0.18, 0.045, 0.12), accentMaterial, [0.22, 0.52, 0]);

  if (!coarsePointer) {
    // Cejas ceñudas discretas: dos barras oscuras usando el material principal.
    const browZ = faceTowardCamera ? 0.19 : -0.19;
    add(group, new THREE.BoxGeometry(0.075, 0.016, 0.018), accentMaterial, [-0.055, 0.79, browZ], [0, 0, -0.24]);
    add(group, new THREE.BoxGeometry(0.075, 0.016, 0.018), accentMaterial, [0.055, 0.79, browZ], [0, 0, 0.24]);
  }

  group.scale.setScalar(0.94);
  return group;
}

export function isMatthiasRivalKing(piece, rivalColor) {
  return piece?.type === 'k' && (rivalColor === 'w' || rivalColor === 'b') && piece?.color === rivalColor;
}

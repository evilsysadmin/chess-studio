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
 * cara permanentemente cabreada y su gorra de oficial, no un uniforme negro
 * que pueda confundir una pieza blanca con una negra.
 */
export function buildMatthiasKing3D(mainMaterial, accentMaterial, { coarsePointer = false, faceTowardCamera = true } = {}) {
  const group = new THREE.Group();
  group.name = 'matthias-rival-king';
  group.userData.matthiasKing = true;
  group.userData.faceStyle = 'permanent-scowl-v2';
  group.userData.capStyle = 'crooked-officer-cap-v2';

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
  const faceShadow = mat(0x9c6d4d, {
    metalness: 0,
    roughness: 0.9,
    clearcoat: 0.01,
    envMapIntensity: 0.1,
    specularIntensity: 0.08,
  });
  const eyeWhite = mat(0xdacfb9, {
    metalness: 0,
    roughness: 0.74,
    clearcoat: 0.03,
    envMapIntensity: 0.16,
    specularIntensity: 0.12,
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

  // Cara: menos muñeco redondo y más viejo general obstinado. El maxilar y las
  // mejillas rompen la esfera perfecta; los ojos pequeños, el ceño asimétrico
  // y la boca torcida conservan su enfado incluso a tamaño móvil.
  add(group, new THREE.SphereGeometry(0.235, segments, coarsePointer ? 16 : 24), face, [0, 0.988, 0], [0, 0, 0], [1.055, 0.94, 0.93], 'matthias-face');
  add(group, new THREE.SphereGeometry(0.18, segments, coarsePointer ? 12 : 18), faceShadow, [0, 0.897, -front * 0.008], [0, 0, 0], [1.12, 0.43, 0.82], 'matthias-jaw-shadow');
  const faceZ = front * 0.214;

  add(group, new THREE.SphereGeometry(0.036, 14, 9), eyeWhite, [-0.078, 1.002, faceZ], [0, 0, 0], [1.22, 0.7, 0.42], 'matthias-eye-white-left');
  add(group, new THREE.SphereGeometry(0.036, 14, 9), eyeWhite, [0.078, 1.002, faceZ], [0, 0, 0], [1.22, 0.7, 0.42], 'matthias-eye-white-right');
  add(group, new THREE.SphereGeometry(0.021, 12, 8), ink, [-0.071, 0.999, front * 0.239], [0, 0, 0], [1, 0.94, 0.62], 'matthias-eye-left');
  add(group, new THREE.SphereGeometry(0.021, 12, 8), ink, [0.071, 0.999, front * 0.239], [0, 0, 0], [1, 0.94, 0.62], 'matthias-eye-right');

  add(group, new THREE.BoxGeometry(0.12, 0.027, 0.022), ink, [-0.072, 1.054, front * 0.224], [0, 0, -0.39 * front], null, 'matthias-brow-left');
  add(group, new THREE.BoxGeometry(0.12, 0.027, 0.022), ink, [0.072, 1.049, front * 0.224], [0, 0, 0.33 * front], null, 'matthias-brow-right');
  add(group, new THREE.BoxGeometry(0.068, 0.014, 0.018), faceShadow, [-0.073, 1.026, front * 0.231], [0, 0, -0.22 * front], null, 'matthias-brow-crease-left');
  add(group, new THREE.BoxGeometry(0.068, 0.014, 0.018), faceShadow, [0.073, 1.024, front * 0.231], [0, 0, 0.2 * front], null, 'matthias-brow-crease-right');

  add(group, new THREE.SphereGeometry(0.032, 14, 9), face, [0.008, 0.958, front * 0.235], [0, 0, 0.08 * front], [0.86, 1.28, 0.68], 'matthias-nose');
  add(group, new THREE.SphereGeometry(0.036, 12, 8), faceShadow, [-0.132, 0.955, front * 0.204], [0, 0, 0], [0.65, 0.86, 0.36], 'matthias-cheek-left');
  add(group, new THREE.SphereGeometry(0.036, 12, 8), faceShadow, [0.132, 0.949, front * 0.204], [0, 0, 0], [0.65, 0.86, 0.36], 'matthias-cheek-right');

  add(group, new THREE.BoxGeometry(0.082, 0.018, 0.02), ink, [-0.035, 0.9, front * 0.226], [0, 0, 0.22 * front], null, 'matthias-mouth-left');
  add(group, new THREE.BoxGeometry(0.082, 0.018, 0.02), ink, [0.035, 0.898, front * 0.226], [0, 0, -0.12 * front], null, 'matthias-mouth-right');
  add(group, new THREE.BoxGeometry(0.062, 0.011, 0.017), faceShadow, [0.045, 0.876, front * 0.218], [0, 0, -0.18 * front], null, 'matthias-lower-lip-crease');

  // Una cicatriz/arruga corta aporta historia sin convertir la cara en un
  // disfraz. No hay bigote: la silueta sigue siendo la del Matthias aprobado.
  if (!coarsePointer) {
    add(group, new THREE.BoxGeometry(0.012, 0.075, 0.014), faceShadow, [0.142, 0.978, front * 0.211], [0, 0, -0.34 * front], null, 'matthias-face-scar');
  }

  // Gorra de oficial deliberadamente imperfecta: copa algo ladeada, banda baja
  // y una visera curva que sobresale. La antigua forma cilíndrica demasiado
  // perfecta era la responsable principal del efecto "Playmobil picoleto".
  const capGroup = new THREE.Group();
  capGroup.name = 'matthias-officer-cap';
  capGroup.position.set(0, 1.105, 0);
  capGroup.rotation.z = -0.055 * front;
  capGroup.rotation.x = 0.025 * front;
  group.add(capGroup);

  add(capGroup, new THREE.CylinderGeometry(0.24, 0.265, 0.12, segments), cap, [0, 0.075, 0], [0, 0, 0], [1.13, 1, 0.92], 'matthias-cap');
  add(capGroup, new THREE.TorusGeometry(0.246, 0.023, 8, segments), capBand, [0, 0.025, 0], [Math.PI / 2, 0, 0], [1.07, 0.9, 1], 'matthias-cap-band');
  add(capGroup, new THREE.TorusGeometry(0.25, 0.01, 8, segments), brass, [0, 0.041, 0], [Math.PI / 2, 0, 0], [1.07, 0.9, 1], 'matthias-cap-piping');
  add(capGroup, new THREE.CylinderGeometry(0.235, 0.25, 0.052, segments), cap, [-0.006, 0.145, -front * 0.006], [0, 0, 0.025 * front], [1.17, 1, 0.91], 'matthias-cap-top');

  const visor = add(
    capGroup,
    new THREE.CylinderGeometry(0.325, 0.35, 0.03, segments, 1, false, -1.02, 2.04),
    cap,
    [0, 0.005, front * 0.175],
    [0.12 * front, 0, 0],
    [1.04, 1, 0.92],
    'matthias-visor',
  );
  visor.castShadow = true;

  add(capGroup, new THREE.SphereGeometry(0.052, 14, 9), brass, [0, 0.095, front * 0.247], [0, 0, 0], [1, 0.92, 0.52], 'matthias-cap-badge');
  // Insignia propia: un minúsculo peón. Nada de cruces ni emblemas históricos.
  add(capGroup, new THREE.CylinderGeometry(0.017, 0.026, 0.042, 10), ink, [0, 0.086, front * 0.278], [Math.PI / 2, 0, 0], null, 'matthias-cap-badge-pawn-body');
  add(capGroup, new THREE.SphereGeometry(0.022, 10, 7), ink, [0, 0.111, front * 0.28], [0, 0, 0], null, 'matthias-cap-badge-pawn-head');

  group.scale.setScalar(1.03);
  return group;
}

export function isMatthiasRivalKing(piece, rivalColor) {
  return piece?.type === 'k' && (rivalColor === 'w' || rivalColor === 'b') && piece?.color === rivalColor;
}

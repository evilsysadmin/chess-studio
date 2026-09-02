import * as THREE from 'three';

const SKIN_DETAIL_PROFILES = Object.freeze({
  default: { colorBoost: 0.34, metalness: 0, roughness: 0.08, rings: [] },
  studio: { colorBoost: 0.48, metalness: 0.02, roughness: -0.03, rings: [[0.305, 0.205, 0.012]] },
  regimiento: { colorBoost: 0.72, metalness: 0.12, roughness: -0.08, rings: [[0.302, 0.205, 0.018], [0.342, 0.19, 0.011]] },
  azul: { colorBoost: 0.7, metalness: 0.04, roughness: -0.04, rings: [[0.31, 0.203, 0.015]] },
  shogunate: { colorBoost: 0.82, metalness: 0.14, roughness: -0.1, emissiveBoost: 0.11, rings: [[0.298, 0.208, 0.018], [0.355, 0.18, 0.012]] },
  esmeralda: { colorBoost: 0.72, metalness: 0.02, roughness: 0.02, rings: [[0.31, 0.205, 0.017]] },
  cyber: { colorBoost: 0.9, metalness: 0.18, roughness: -0.16, emissiveBoost: 0.2, rings: [[0.294, 0.21, 0.021], [0.36, 0.178, 0.012]] },
  marines: { colorBoost: 0.78, metalness: 0.04, roughness: 0.08, rings: [[0.29, 0.215, 0.022], [0.345, 0.185, 0.014]] },
  delta: { colorBoost: 0.88, metalness: 0.14, roughness: -0.09, emissiveBoost: 0.14, rings: [[0.292, 0.214, 0.022], [0.352, 0.181, 0.013]] },
});

function profileFor(skinId) {
  return SKIN_DETAIL_PROFILES[skinId] || SKIN_DETAIL_PROFILES.studio;
}

export function reinforcePieceSkinMaterial(material, targetColor, skinId, { accent = false } = {}) {
  if (!material?.color) return material;
  const profile = profileFor(skinId);
  const target = new THREE.Color(targetColor);
  const polishedIvory = material.userData?.surfaceRole === 'ivory' && !accent;
  const classicEbony = material.userData?.surfaceRole === 'ebony' && !accent && (material.metalness ?? 0) < 0.58;
  const boost = polishedIvory
    ? Math.min(0.14, profile.colorBoost)
    : accent
      ? Math.min(1, profile.colorBoost + 0.18)
      : profile.colorBoost;

  material.color.lerp(target, boost);
  material.metalness = THREE.MathUtils.clamp((material.metalness || 0) + profile.metalness + (accent ? 0.05 : 0), 0, 1);
  material.roughness = THREE.MathUtils.clamp((material.roughness || 0.5) + profile.roughness - (accent ? 0.03 : 0), 0.08, 1);

  if (polishedIvory) {
    material.color.lerp(new THREE.Color(0xfff4dc), 0.17);
    material.metalness = Math.min(material.metalness, 0.01);
    material.roughness = THREE.MathUtils.clamp(material.roughness, 0.31, 0.4);
    material.clearcoat = THREE.MathUtils.clamp(material.clearcoat ?? 0.08, 0.4, 0.48);
    material.clearcoatRoughness = THREE.MathUtils.clamp(material.clearcoatRoughness ?? 0.5, 0.2, 0.28);
    material.specularIntensity = THREE.MathUtils.clamp(material.specularIntensity ?? 0.3, 0.5, 0.62);
    material.envMapIntensity = THREE.MathUtils.clamp(material.envMapIntensity ?? 0.4, 0.58, 0.72);
    material.sheen = THREE.MathUtils.clamp(material.sheen ?? 0.02, 0.02, 0.055);
    material.sheenRoughness = THREE.MathUtils.clamp(material.sheenRoughness ?? 0.58, 0.46, 0.62);
    material.userData.pieceFinish = 'polished-carved-ivory-v4';
  }

  if (classicEbony) {
    material.color.lerp(new THREE.Color(0x3a3c42), 0.12);
    material.roughness = THREE.MathUtils.clamp(material.roughness, 0.22, 0.33);
    material.clearcoat = Math.max(material.clearcoat ?? 0, 0.78);
    material.clearcoatRoughness = Math.min(material.clearcoatRoughness ?? 0.16, 0.17);
    material.specularIntensity = Math.max(material.specularIntensity ?? 0.7, 0.9);
    material.envMapIntensity = Math.max(material.envMapIntensity ?? 0.78, 0.96);
    material.userData.pieceFinish = 'polished-ebony-lacquer-v4';
  }

  if (profile.emissiveBoost && material.emissive) {
    material.emissive.lerp(target, accent ? 0.72 : 0.32);
    material.emissiveIntensity = Math.max(material.emissiveIntensity || 0, profile.emissiveBoost * (accent ? 1.25 : 0.72));
  }
  material.userData.skin3DId = skinId;
  material.userData.skin3DIdentity = 'distinct-v2';
  return material;
}

function addRing(group, material, y, radius, tube, coarsePointer) {
  const mesh = new THREE.Mesh(
    new THREE.TorusGeometry(radius, coarsePointer ? Math.max(0.009, tube * 0.82) : tube, 8, coarsePointer ? 24 : 36),
    material,
  );
  mesh.position.y = y;
  mesh.rotation.x = Math.PI / 2;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.userData.skinDetail = true;
  group.add(mesh);
  return mesh;
}

function addKnightSculptMesh(group, geometry, material, position, scale = [1, 1, 1], rotation = [0, 0, 0], role = 'detail') {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(...position);
  mesh.scale.set(...scale);
  mesh.rotation.set(...rotation);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.userData.skinDetail = true;
  mesh.userData.knightSculptDetail = role;
  group.add(mesh);
  return mesh;
}

function knightMeshesByRole(group, suffix) {
  const matches = [];
  group.traverse((child) => {
    const role = child?.geometry?.userData?.board3DKnightGeometryRole;
    if (child?.isMesh && typeof role === 'string' && role.endsWith(suffix)) matches.push(child);
  });
  return matches;
}

function approvedKnightHeadGeometry(previousGeometry) {
  const shape = new THREE.Shape();
  // The approved mock uses a compact Staunton-like horse: a slim rear neck,
  // a small poll, a forward muzzle and a clean jaw/chest line. The silhouette
  // does the work; decorative meshes must not create a second shoulder hump.
  shape.moveTo(-0.13, -0.035);
  shape.bezierCurveTo(-0.17, 0.13, -0.145, 0.32, -0.075, 0.48);
  shape.bezierCurveTo(-0.025, 0.59, 0.055, 0.68, 0.145, 0.70);
  shape.bezierCurveTo(0.235, 0.715, 0.335, 0.66, 0.375, 0.565);
  shape.bezierCurveTo(0.405, 0.49, 0.345, 0.435, 0.265, 0.415);
  shape.bezierCurveTo(0.185, 0.395, 0.125, 0.36, 0.105, 0.29);
  shape.bezierCurveTo(0.085, 0.20, 0.105, 0.095, 0.045, 0.015);
  shape.bezierCurveTo(-0.01, -0.055, -0.075, -0.07, -0.13, -0.035);

  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: 0.205,
    bevelEnabled: true,
    bevelThickness: 0.032,
    bevelSize: 0.023,
    bevelSegments: 2,
    curveSegments: 14,
  });
  geometry.center();
  geometry.userData = {
    ...previousGeometry?.userData,
    board3DKnightTemplateGeometry: false,
    board3DKnightGeometryClone: true,
  };
  return geometry;
}

function applyApprovedKnightSilhouette(group, coarsePointer) {
  if (coarsePointer) return 0;
  const [head] = knightMeshesByRole(group, ':knight-head');
  const [neck] = knightMeshesByRole(group, ':knight-neck');
  const ears = knightMeshesByRole(group, ':knight-ear');
  const eyes = knightMeshesByRole(group, ':knight-eye');
  if (!head || !neck) return 0;

  const previous = head.geometry;
  head.geometry = approvedKnightHeadGeometry(previous);
  previous?.dispose?.();
  head.position.set(0.005, 0.695, 0);
  head.scale.set(0.96, 0.94, 1.0);
  head.userData.knightHeadProfile = 'approved-mock-staunton-v6';

  neck.scale.set(0.84, 0.90, 0.84);
  neck.userData.knightNeckProfile = 'slim-staunton-v6';

  if (ears[0]) {
    ears[0].position.set(-0.052, 0.986, 0.018);
    ears[0].scale.set(0.86, 0.88, 0.82);
  }
  if (ears[1]) {
    ears[1].position.set(0.052, 0.986, 0.018);
    ears[1].scale.set(0.86, 0.88, 0.82);
  }
  if (eyes[0]) eyes[0].position.set(0.168, 0.815, 0.112);
  if (eyes[1]) eyes[1].position.set(0.168, 0.815, -0.112);

  group.userData.board3DKnightSilhouetteVersion = 'approved-mock-staunton-v6';
  group.userData.board3DKnightPosture = 'compact-forward-staunton-v6';
  return 1;
}

function addPremiumKnightSculpture(group, accentMaterial, coarsePointer) {
  if (coarsePointer) {
    group.userData.board3DKnightDetailVersion = 'lite-v1';
    return 0;
  }

  const mainMaterial = group.children.find((child) => child?.isMesh && child.material && !child.userData?.contactShadow)?.material || accentMaterial;
  let count = 0;

  // Keep only the details that survive tactical-camera distance. The mock reads
  // as a carved horse because its silhouette is clean, not because it carries
  // a pile of micro-meshes.
  addKnightSculptMesh(
    group,
    new THREE.SphereGeometry(0.098, 20, 14),
    mainMaterial,
    [0.295, 0.712, 0],
    [1.32, 0.50, 0.76],
    [0, 0, -0.09],
    'muzzle',
  );
  count += 1;

  for (const z of [-0.07, 0.07]) {
    addKnightSculptMesh(
      group,
      new THREE.BoxGeometry(0.145, 0.018, 0.024, 2, 1, 1),
      accentMaterial,
      [0.17, 0.75, z * 1.62],
      [1, 1, 1],
      [0, z > 0 ? -0.06 : 0.06, -0.23],
      'bridle',
    );
    count += 1;
  }

  const maneGeometry = new THREE.ConeGeometry(0.034, 0.105, 10);
  for (let index = 0; index < 3; index += 1) {
    addKnightSculptMesh(
      group,
      maneGeometry.clone(),
      mainMaterial,
      [-0.11, 0.665 + index * 0.076, 0],
      [0.72, 0.86 - index * 0.06, 0.55],
      [0, 0, -0.12],
      'mane',
    );
    count += 1;
  }
  maneGeometry.dispose();

  group.userData.board3DKnightDetailVersion = 'mock-sculpted-v6';
  group.userData.board3DKnightPremiumDetailCount = count;
  group.userData.board3DKnightManeProfile = 'three-low-carved-locks-v6';
  return count;
}

export function addPieceSkinDetails(group, type, skinId, accentMaterial, coarsePointer = false) {
  const profile = profileFor(skinId);
  for (const [y, radius, tube] of profile.rings) addRing(group, accentMaterial, y, radius, tube, coarsePointer);

  if (skinId === 'cyber') {
    addRing(group, accentMaterial, type === 'p' ? 0.56 : 0.43, type === 'p' ? 0.155 : 0.17, 0.01, coarsePointer);
  } else if (skinId === 'shogunate') {
    addRing(group, accentMaterial, type === 'n' ? 0.48 : 0.39, type === 'n' ? 0.16 : 0.165, 0.009, coarsePointer);
  } else if (skinId === 'regimiento' || skinId === 'delta') {
    const studCount = coarsePointer ? 3 : 4;
    for (let index = 0; index < studCount; index += 1) {
      const angle = index * Math.PI * 2 / studCount;
      const stud = new THREE.Mesh(new THREE.SphereGeometry(0.022, 10, 7), accentMaterial);
      stud.position.set(Math.cos(angle) * 0.245, 0.18, Math.sin(angle) * 0.245);
      stud.castShadow = true;
      stud.userData.skinDetail = true;
      group.add(stud);
    }
  }

  if (type === 'n') {
    applyApprovedKnightSilhouette(group, coarsePointer);
    addPremiumKnightSculpture(group, accentMaterial, coarsePointer);
  }

  group.userData.skin3DId = skinId;
  group.userData.skin3DIdentity = 'distinct-v2';
}

export { SKIN_DETAIL_PROFILES };

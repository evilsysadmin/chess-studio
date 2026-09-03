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

function preserveKnightGeometryRole(geometry, previousGeometry) {
  geometry.userData = {
    ...previousGeometry?.userData,
    board3DKnightTemplateGeometry: false,
    board3DKnightGeometryClone: true,
  };
  return geometry;
}

function mockKnightBodyGeometry(previousGeometry) {
  const shape = new THREE.Shape();
  // v9 deliberately mirrors the approved generated mock: one clean, heavy
  // sculptural slab with a long arched neck and restrained angular muzzle.
  // No separate cheek/jaw blobs are layered on top, which is what made v8
  // collapse into the infamous steroid-bulldog silhouette at board scale.
  shape.moveTo(-0.205, 0.035);
  shape.bezierCurveTo(-0.255, 0.26, -0.245, 0.60, -0.155, 0.86);
  shape.bezierCurveTo(-0.095, 1.035, 0.015, 1.115, 0.145, 1.125);
  shape.bezierCurveTo(0.255, 1.13, 0.325, 1.065, 0.355, 0.965);
  shape.bezierCurveTo(0.39, 0.885, 0.485, 0.845, 0.545, 0.77);
  shape.bezierCurveTo(0.575, 0.705, 0.545, 0.635, 0.455, 0.61);
  shape.bezierCurveTo(0.355, 0.585, 0.275, 0.535, 0.225, 0.455);
  shape.bezierCurveTo(0.17, 0.365, 0.145, 0.255, 0.17, 0.17);
  shape.bezierCurveTo(0.09, 0.075, -0.075, 0.02, -0.205, 0.035);

  const depth = 0.285;
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth,
    bevelEnabled: true,
    bevelThickness: 0.038,
    bevelSize: 0.03,
    bevelSegments: 3,
    curveSegments: 20,
  });
  geometry.translate(0, 0, -depth / 2);
  return preserveKnightGeometryRole(geometry, previousGeometry);
}

function retireLegacyKnightPart(mesh, marker) {
  if (!mesh?.parent) return 0;
  mesh.userData.knightTemplatePartRetired = marker;
  mesh.geometry?.dispose?.();
  mesh.parent.remove(mesh);
  return 1;
}

function applyApprovedKnightSilhouette(group, coarsePointer) {
  if (coarsePointer) return 0;
  const [head] = knightMeshesByRole(group, ':knight-head');
  const [neck] = knightMeshesByRole(group, ':knight-neck');
  const ears = knightMeshesByRole(group, ':knight-ear');
  const eyes = knightMeshesByRole(group, ':knight-eye');
  if (!head) return 0;

  const previousHead = head.geometry;
  head.geometry = mockKnightBodyGeometry(previousHead);
  previousHead?.dispose?.();
  head.position.set(-0.015, 0.285, 0);
  head.scale.set(1, 1, 1);
  head.userData.knightHeadProfile = 'approved-generated-mock-v9';

  let retired = 0;
  retired += retireLegacyKnightPart(neck, 'single-slab-mock-v9');
  for (const ear of ears) retired += retireLegacyKnightPart(ear, 'single-slab-mock-v9');
  for (const eye of eyes) retired += retireLegacyKnightPart(eye, 'single-slab-mock-v9');

  group.userData.board3DKnightSilhouetteVersion = 'approved-generated-mock-v9';
  group.userData.board3DKnightPosture = 'sleek-arched-neck-v9';
  group.userData.board3DKnightRetiredLegacyParts = retired;
  return 1;
}

function addMockKnightSculpture(group, accentMaterial, coarsePointer) {
  if (coarsePointer) {
    group.userData.board3DKnightDetailVersion = 'lite-v1';
    return 0;
  }

  const mainMaterial = group.children.find((child) => child?.isMesh && child.material && !child.userData?.contactShadow)?.material || accentMaterial;
  let count = 0;

  const manePoints = [
    new THREE.Vector3(-0.205, 0.53, 0),
    new THREE.Vector3(-0.235, 0.76, 0),
    new THREE.Vector3(-0.185, 1.02, 0),
    new THREE.Vector3(-0.07, 1.235, 0),
    new THREE.Vector3(0.13, 1.285, 0),
    new THREE.Vector3(0.305, 1.185, 0),
  ];
  for (const z of [-0.151, 0.151]) {
    const curve = new THREE.CatmullRomCurve3(manePoints.map((point) => point.clone().setZ(z)), false, 'catmullrom', 0.38);
    addKnightSculptMesh(
      group,
      new THREE.TubeGeometry(curve, 28, 0.018, 8, false),
      mainMaterial,
      [0, 0, 0],
      [1, 1, 1],
      [0, 0, 0],
      'mane-rail',
    );
    count += 1;
  }

  for (const angle of [-0.62, 0, 0.62]) {
    const radius = 0.347;
    const slot = addKnightSculptMesh(
      group,
      new THREE.BoxGeometry(0.026, 0.115, 0.018),
      accentMaterial,
      [Math.sin(angle) * radius, 0.105, Math.cos(angle) * radius],
      [1, 1, 1],
      [0, angle, 0],
      'base-slot',
    );
    slot.castShadow = false;
    count += 1;
  }

  group.userData.board3DKnightDetailVersion = 'approved-generated-mock-v9';
  group.userData.board3DKnightPremiumDetailCount = count;
  group.userData.board3DKnightManeProfile = 'double-raised-rail-v9';
  group.userData.board3DKnightBaseAccentProfile = 'three-inset-slots-v9';
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
    addMockKnightSculpture(group, accentMaterial, coarsePointer);
  }

  group.userData.skin3DId = skinId;
  group.userData.skin3DIdentity = 'distinct-v2';
}

export { SKIN_DETAIL_PROFILES };

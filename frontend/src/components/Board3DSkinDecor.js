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

  // Premium carved ivory: not porcelain-white and not chalk-matte. A broad,
  // restrained satin highlight makes the turning and bevels readable under
  // the warm War Room lights without turning the army into plastic toys.
  if (polishedIvory) {
    material.color.lerp(new THREE.Color(0xb39b7c), 0.13);
    material.metalness = Math.min(material.metalness, 0.012);
    material.roughness = THREE.MathUtils.clamp(material.roughness, 0.44, 0.56);
    material.clearcoat = THREE.MathUtils.clamp(material.clearcoat ?? 0.08, 0.24, 0.34);
    material.clearcoatRoughness = THREE.MathUtils.clamp(material.clearcoatRoughness ?? 0.5, 0.26, 0.36);
    material.specularIntensity = THREE.MathUtils.clamp(material.specularIntensity ?? 0.3, 0.34, 0.46);
    material.envMapIntensity = THREE.MathUtils.clamp(material.envMapIntensity ?? 0.4, 0.38, 0.52);
    material.sheen = THREE.MathUtils.clamp(material.sheen ?? 0.02, 0.018, 0.05);
    material.sheenRoughness = THREE.MathUtils.clamp(material.sheenRoughness ?? 0.58, 0.48, 0.68);
    material.userData.pieceFinish = 'polished-carved-ivory-v3';
  }

  // Classic black skins get a deep ebony/lacquer response. Highly metallic
  // skins are intentionally excluded so Cyber/Regimiento keep their own PBR.
  if (classicEbony) {
    material.roughness = THREE.MathUtils.clamp(material.roughness, 0.28, 0.44);
    material.clearcoat = Math.max(material.clearcoat ?? 0, 0.66);
    material.clearcoatRoughness = Math.min(material.clearcoatRoughness ?? 0.18, 0.2);
    material.specularIntensity = Math.max(material.specularIntensity ?? 0.7, 0.8);
    material.envMapIntensity = Math.max(material.envMapIntensity ?? 0.78, 0.86);
    material.userData.pieceFinish = 'polished-ebony-lacquer-v3';
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

function addPremiumKnightSculpture(group, accentMaterial, coarsePointer) {
  if (coarsePointer) {
    group.userData.board3DKnightDetailVersion = 'lite-v1';
    return 0;
  }

  const mainMaterial = group.children.find((child) => child?.isMesh && child.material && !child.userData?.contactShadow)?.material || accentMaterial;
  let count = 0;

  // Rounded muzzle gives the profile an actual horse nose instead of a flat
  // extruded chess symbol. It projects along +X, matching the existing eyes.
  addKnightSculptMesh(
    group,
    new THREE.SphereGeometry(0.105, 18, 12),
    mainMaterial,
    [0.235, 0.705, 0],
    [1.42, 0.68, 0.82],
    [0, 0, -0.08],
    'muzzle',
  );
  count += 1;

  // Two tiny nostrils and two low brow ridges add readable carving at normal
  // desktop distance while remaining symmetric from either side of the board.
  for (const z of [-0.071, 0.071]) {
    addKnightSculptMesh(
      group,
      new THREE.SphereGeometry(0.018, 12, 8),
      accentMaterial,
      [0.325, 0.708, z],
      [1, 0.58, 0.72],
      [0, 0, 0],
      'nostril',
    );
    addKnightSculptMesh(
      group,
      new THREE.BoxGeometry(0.105, 0.026, 0.025, 2, 1, 1),
      mainMaterial,
      [0.155, 0.865, z * 1.76],
      [1, 1, 1],
      [0, z > 0 ? -0.12 : 0.12, -0.12],
      'brow',
    );
    count += 2;
  }

  // Segmented mane follows the rear contour. Using individual carved fins
  // catches highlights far better than a painted stripe and gives the knight
  // a richer silhouette without changing its square footprint.
  const maneGeometry = new THREE.ConeGeometry(0.047, 0.145, 9);
  for (let index = 0; index < 4; index += 1) {
    addKnightSculptMesh(
      group,
      maneGeometry.clone(),
      mainMaterial,
      [-0.11 - index * 0.012, 0.76 + index * 0.083, 0],
      [1, 1 - index * 0.055, 0.72],
      [0, 0, -0.22],
      'mane',
    );
    count += 1;
  }
  maneGeometry.dispose();

  group.userData.board3DKnightDetailVersion = 'sculpted-v3';
  group.userData.board3DKnightPremiumDetailCount = count;
  return count;
}

export function addPieceSkinDetails(group, type, skinId, accentMaterial, coarsePointer = false) {
  const profile = profileFor(skinId);
  for (const [y, radius, tube] of profile.rings) addRing(group, accentMaterial, y, radius, tube, coarsePointer);

  // Las firmas más expresivas siguen siendo simétricas para no crear una falsa
  // noción de "frontal" en piezas que pueden verse desde ambos lados del tablero.
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

  if (type === 'n') addPremiumKnightSculpture(group, accentMaterial, coarsePointer);

  group.userData.skin3DId = skinId;
  group.userData.skin3DIdentity = 'distinct-v2';
}

export { SKIN_DETAIL_PROFILES };

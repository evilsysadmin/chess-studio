import * as THREE from 'three';

function material(color, options = {}) {
  const result = new THREE.MeshPhysicalMaterial({
    color,
    metalness: options.metalness ?? 0.08,
    roughness: options.roughness ?? 0.58,
    clearcoat: options.clearcoat ?? 0.12,
    clearcoatRoughness: options.clearcoatRoughness ?? 0.4,
    emissive: options.emissive ?? 0x000000,
    emissiveIntensity: options.emissiveIntensity ?? 0,
    envMapIntensity: options.envMapIntensity ?? 0.38,
    specularIntensity: options.specularIntensity ?? 0.34,
  });
  result.userData.chroniclesOwnedMaterial = true;
  return result;
}

function add(group, geometry, mat, position = [0, 0, 0], rotation = [0, 0, 0], scale = null, name = '') {
  const node = new THREE.Mesh(geometry, mat);
  node.position.set(...position);
  node.rotation.set(...rotation);
  if (scale) node.scale.set(...scale);
  if (name) node.name = name;
  node.castShadow = true;
  node.receiveShadow = true;
  group.add(node);
  return node;
}

function capsule(group, radius, length, mat, position, rotation = [0, 0, 0], scale = null, name = '', segments = 16) {
  return add(
    group,
    new THREE.CapsuleGeometry(radius, length, Math.max(4, Math.round(segments * 0.35)), Math.max(8, segments)),
    mat,
    position,
    rotation,
    scale,
    name,
  );
}

function lathe(group, profile, mat, segments, name) {
  return add(
    group,
    new THREE.LatheGeometry(profile.map(([radius, y]) => new THREE.Vector2(radius, y)), segments),
    mat,
    [0, 0, 0],
    [0, 0, 0],
    null,
    name,
  );
}

function basePlinth(group, stone, metal, segments) {
  lathe(group, [
    [0.62, 0], [0.7, 0.08], [0.66, 0.18], [0.5, 0.25],
    [0.42, 0.31], [0.4, 0.36],
  ], stone, segments, 'chronicles-piece-plinth');
  add(group, new THREE.TorusGeometry(0.52, 0.035, 8, segments), metal, [0, 0.2, 0], [Math.PI / 2, 0, 0], null, 'chronicles-piece-plinth-ring');
}

function faceRig(group, { skin, ink, segments, y = 1.42, mood = 'stern' }) {
  const rig = new THREE.Group();
  rig.name = 'chronicles-face-rig';
  group.add(rig);
  const detailSegments = Math.max(8, Math.round(segments * 0.55));
  add(rig, new THREE.SphereGeometry(0.22, segments, Math.max(12, segments / 2)), skin, [0, y, 0], [0, 0, 0], [1, 0.95, 0.92], 'chronicles-face');
  const z = 0.205;
  const browTilt = mood === 'stern' ? 0.36 : 0.18;
  add(rig, new THREE.SphereGeometry(0.024, 10, 8), ink, [-0.066, y + 0.012, z], [0, 0, 0], [1.2, 0.45, 0.38], 'chronicles-eye-left');
  add(rig, new THREE.SphereGeometry(0.024, 10, 8), ink, [0.066, y + 0.012, z], [0, 0, 0], [1.2, 0.45, 0.38], 'chronicles-eye-right');
  add(rig, new THREE.BoxGeometry(0.098, 0.018, 0.015), ink, [-0.06, y + 0.065, z + 0.004], [0, 0, -browTilt], null, 'chronicles-brow-left');
  add(rig, new THREE.BoxGeometry(0.098, 0.018, 0.015), ink, [0.06, y + 0.065, z + 0.004], [0, 0, browTilt], null, 'chronicles-brow-right');
  add(rig, new THREE.ConeGeometry(0.035, 0.095, detailSegments), skin, [0, y - 0.005, z + 0.032], [Math.PI / 2, 0, 0], null, 'chronicles-nose');
  add(rig, new THREE.BoxGeometry(0.09, 0.012, 0.012), ink, [0, y - 0.075, z + 0.01], [0, 0, mood === 'stern' ? -0.04 : 0.02], null, 'chronicles-mouth');
  add(rig, new THREE.SphereGeometry(0.055, detailSegments, 6), skin, [-0.217, y, 0], [0, 0, 0], [0.45, 0.82, 0.55], 'chronicles-ear-left');
  add(rig, new THREE.SphereGeometry(0.055, detailSegments, 6), skin, [0.217, y, 0], [0, 0, 0], [0.45, 0.82, 0.55], 'chronicles-ear-right');
  return rig;
}

function buildMatthias(segments) {
  const root = new THREE.Group();
  const detailSegments = Math.max(8, Math.round(segments * 0.55));
  const ivory = material(0xd8cdbb, { metalness: 0.02, roughness: 0.72, clearcoat: 0.06 });
  const brass = material(0xb88936, { metalness: 0.78, roughness: 0.3, clearcoat: 0.24 });
  const coat = material(0x35302b, { roughness: 0.68, clearcoat: 0.04 });
  const coatEdge = material(0x50443b, { roughness: 0.62, clearcoat: 0.05 });
  const wine = material(0x6f2f2d, { roughness: 0.72 });
  const leather = material(0x5a3822, { roughness: 0.82 });
  const skin = material(0xeee2d0, { metalness: 0, roughness: 0.86, clearcoat: 0.02 });
  const ink = material(0x090a0b, { metalness: 0, roughness: 0.9 });
  basePlinth(root, ivory, brass, segments);
  lathe(root, [[0.34, 0.34], [0.28, 0.54], [0.25, 0.83], [0.31, 1.06], [0.27, 1.18]], coat, segments, 'matthias-expedition-coat');
  add(root, new THREE.TorusGeometry(0.29, 0.024, 8, segments), brass, [0, 0.56, 0], [Math.PI / 2, 0, 0], null, 'matthias-expedition-belt');
  add(root, new THREE.BoxGeometry(0.1, 0.46, 0.025), wine, [-0.065, 0.83, 0.285], [0, 0, -0.42], null, 'matthias-expedition-sash');
  add(root, new THREE.BoxGeometry(0.13, 0.42, 0.03), coatEdge, [-0.12, 1.01, 0.27], [0, 0, -0.34], null, 'matthias-lapel-left');
  add(root, new THREE.BoxGeometry(0.13, 0.42, 0.03), coatEdge, [0.12, 1.01, 0.27], [0, 0, 0.34], null, 'matthias-lapel-right');
  [-0.01, -0.12, -0.23].forEach((offset, index) => {
    add(root, new THREE.SphereGeometry(0.032, detailSegments, 6), brass, [0.09, 0.95 + offset, 0.295], [0, 0, 0], null, `matthias-coat-button-${index}`);
  });
  add(root, new THREE.SphereGeometry(0.17, detailSegments, 8), coatEdge, [-0.29, 1.08, 0], [0, 0, 0], [1.15, 0.5, 1.1], 'matthias-shoulder-left');
  add(root, new THREE.SphereGeometry(0.17, detailSegments, 8), coatEdge, [0.29, 1.08, 0], [0, 0, 0], [1.15, 0.5, 1.1], 'matthias-shoulder-right');
  add(root, new THREE.BoxGeometry(0.24, 0.18, 0.1), leather, [0.31, 0.72, -0.02], [0, -0.24, 0], null, 'matthias-satchel');
  add(root, new THREE.BoxGeometry(0.035, 0.68, 0.025), leather, [0.12, 0.86, 0.02], [0.08, 0, -0.55], null, 'matthias-satchel-strap');
  add(root, new THREE.CylinderGeometry(0.035, 0.035, 0.56, 8), leather, [-0.34, 0.82, 0.04], [0.12, 0, -0.18], null, 'matthias-map-case');
  faceRig(root, { skin, ink, segments, y: 1.39, mood: 'stern' });
  add(root, new THREE.BoxGeometry(0.085, 0.025, 0.018), ink, [-0.042, 1.285, 0.216], [0, 0, -0.12], null, 'matthias-moustache-left');
  add(root, new THREE.BoxGeometry(0.085, 0.025, 0.018), ink, [0.042, 1.285, 0.216], [0, 0, 0.12], null, 'matthias-moustache-right');
  const cap = material(0x14181e, { metalness: 0.15, roughness: 0.5, clearcoat: 0.12 });
  add(root, new THREE.CylinderGeometry(0.245, 0.21, 0.12, segments), cap, [0, 1.57, 0], [0, 0, 0], [1.06, 1, 0.94], 'matthias-expedition-cap');
  add(root, new THREE.BoxGeometry(0.28, 0.028, 0.16), cap, [0, 1.515, 0.17], [-0.12, 0, 0], null, 'matthias-expedition-visor');
  add(root, new THREE.BoxGeometry(0.1, 0.055, 0.026), brass, [0, 1.57, 0.23], [0, 0, Math.PI / 4], null, 'matthias-expedition-cap-badge');
  root.userData.chroniclesCharacterId = 'matthias';
  root.userData.chroniclesSilhouette = 'pawn-chronist-expedition';
  root.userData.chroniclesArtTier = 'premium-cast-v2';
  return root;
}

function buildHildegard(segments) {
  const root = new THREE.Group();
  const detailSegments = Math.max(8, Math.round(segments * 0.55));
  const stone = material(0x7f8588, { metalness: 0.28, roughness: 0.5, clearcoat: 0.1 });
  const steel = material(0xaeb4b7, { metalness: 0.72, roughness: 0.28, clearcoat: 0.22 });
  const dark = material(0x25292d, { metalness: 0.38, roughness: 0.46 });
  const cloth = material(0x39434a, { roughness: 0.76 });
  const ember = material(0x9c5d2f, { metalness: 0.24, roughness: 0.5 });
  const skin = material(0xcaa98e, { metalness: 0, roughness: 0.88 });
  const eye = material(0x1a0f0a, { metalness: 0, roughness: 0.82, emissive: 0x8e3e18, emissiveIntensity: 0.18 });
  basePlinth(root, stone, steel, segments);
  lathe(root, [[0.42, 0.35], [0.36, 0.58], [0.39, 0.9], [0.43, 1.12]], cloth, segments, 'hildegard-guard-body');
  add(root, new THREE.SphereGeometry(0.2, detailSegments, 8), steel, [-0.35, 1.08, 0], [0, 0, 0], [1.3, 0.55, 1.12], 'hildegard-pauldron-left');
  add(root, new THREE.SphereGeometry(0.2, detailSegments, 8), steel, [0.35, 1.08, 0], [0, 0, 0], [1.3, 0.55, 1.12], 'hildegard-pauldron-right');
  add(root, new THREE.TorusGeometry(0.31, 0.032, 8, segments), steel, [0, 1.09, 0], [Math.PI / 2, 0, 0], null, 'hildegard-gorget');
  add(root, new THREE.CylinderGeometry(0.42, 0.42, 0.26, segments), dark, [0, 1.17, 0], [0, 0, 0], null, 'hildegard-rook-helm');
  add(root, new THREE.BoxGeometry(0.31, 0.09, 0.055), dark, [0, 1.235, 0.405], [0, 0, 0], null, 'hildegard-visor');
  add(root, new THREE.BoxGeometry(0.245, 0.045, 0.018), skin, [0, 1.235, 0.438], [0, 0, 0], null, 'hildegard-face-slit');
  add(root, new THREE.SphereGeometry(0.018, 8, 6), eye, [-0.072, 1.242, 0.454], [0, 0, 0], null, 'hildegard-eye-left');
  add(root, new THREE.SphereGeometry(0.018, 8, 6), eye, [0.072, 1.242, 0.454], [0, 0, 0], null, 'hildegard-eye-right');
  for (let i = 0; i < 6; i += 1) {
    const angle = (i / 6) * Math.PI * 2;
    add(root, new THREE.BoxGeometry(0.16, 0.18, 0.16), steel, [Math.cos(angle) * 0.31, 1.36, Math.sin(angle) * 0.31], [0, -angle, 0], null, `hildegard-crenel-${i}`);
  }
  add(root, new THREE.BoxGeometry(0.62, 0.72, 0.11), steel, [0.43, 0.78, 0.08], [0, -0.18, 0.02], null, 'hildegard-tower-shield');
  add(root, new THREE.BoxGeometry(0.42, 0.09, 0.06), ember, [0.43, 0.8, 0.145], [0, -0.18, 0], null, 'hildegard-shield-mark');
  [[0.25, 0.99], [0.25, 0.58], [0.58, 0.99], [0.58, 0.58]].forEach(([x, y], index) => {
    add(root, new THREE.SphereGeometry(0.03, detailSegments, 6), dark, [x, y, 0.151], [0, 0, 0], null, `hildegard-shield-rivet-${index}`);
  });
  add(root, new THREE.CylinderGeometry(0.07, 0.07, 0.72, 10), steel, [-0.42, 0.8, 0.02], [0, 0, -0.22], null, 'hildegard-mace-haft');
  add(root, new THREE.DodecahedronGeometry(0.16, 0), steel, [-0.5, 1.14, 0.03], [0, 0, 0], null, 'hildegard-mace-head');
  root.userData.chroniclesCharacterId = 'rook';
  root.userData.chroniclesSilhouette = 'rook-guardian';
  root.userData.chroniclesArtTier = 'premium-cast-v2';
  return root;
}

function buildAziz(segments) {
  const root = new THREE.Group();
  const detailSegments = Math.max(8, Math.round(segments * 0.55));
  const sandstone = material(0xb9a47d, { metalness: 0.03, roughness: 0.78 });
  const brass = material(0xc29a45, { metalness: 0.75, roughness: 0.3, clearcoat: 0.2 });
  const robe = material(0x30423d, { roughness: 0.75 });
  const robeEdge = material(0x496059, { roughness: 0.68, clearcoat: 0.03 });
  const scarf = material(0x8c6736, { roughness: 0.7 });
  const glow = material(0xe6b55a, { metalness: 0.08, roughness: 0.34, emissive: 0xff8b20, emissiveIntensity: 1.8 });
  const skin = material(0xb8845f, { metalness: 0, roughness: 0.9 });
  const ink = material(0x0a0908, { metalness: 0, roughness: 0.9 });
  basePlinth(root, sandstone, brass, segments);
  lathe(root, [[0.4, 0.34], [0.32, 0.56], [0.28, 0.94], [0.31, 1.18]], robe, segments, 'aziz-bishop-robe');
  add(root, new THREE.TorusGeometry(0.31, 0.035, 8, segments), robeEdge, [0, 1.08, 0], [Math.PI / 2, 0, 0], null, 'aziz-robe-collar');
  add(root, new THREE.BoxGeometry(0.11, 0.52, 0.025), scarf, [0.09, 0.86, 0.285], [0, 0, 0.48], null, 'aziz-diagonal-scarf');
  add(root, new THREE.SphereGeometry(0.065, detailSegments, 6), brass, [0.18, 1.035, 0.285], [0, 0, 0], [1, 0.45, 1], 'aziz-scarf-clasp');
  faceRig(root, { skin, ink, segments, y: 1.39, mood: 'calm' });
  add(root, new THREE.ConeGeometry(0.27, 0.46, segments), robe, [0, 1.68, 0], [0, 0, 0], null, 'aziz-split-mitre');
  add(root, new THREE.BoxGeometry(0.04, 0.34, 0.03), sandstone, [0, 1.72, 0.23], [0, 0, 0.38], null, 'aziz-mitre-split');
  add(root, new THREE.BoxGeometry(0.025, 0.3, 0.025), brass, [-0.075, 1.72, 0.244], [0, 0, 0.38], null, 'aziz-mitre-trim-left');
  add(root, new THREE.BoxGeometry(0.025, 0.3, 0.025), brass, [0.075, 1.72, 0.244], [0, 0, 0.38], null, 'aziz-mitre-trim-right');
  add(root, new THREE.CylinderGeometry(0.035, 0.035, 0.8, 8), brass, [-0.42, 0.82, 0.02], [0.05, 0, -0.16], null, 'aziz-lantern-staff');
  add(root, new THREE.OctahedronGeometry(0.17, 0), glow, [-0.47, 1.22, 0.04], [0, 0, 0], null, 'aziz-lantern');
  add(root, new THREE.TorusGeometry(0.2, 0.025, 6, detailSegments), brass, [-0.47, 1.22, 0.04], [Math.PI / 2, 0, 0], null, 'aziz-lantern-cage-ring');
  [-0.14, 0.14].forEach((x, index) => {
    add(root, new THREE.CylinderGeometry(0.018, 0.018, 0.38, 6), brass, [-0.47 + x, 1.22, 0.04], [0, 0, 0], null, `aziz-lantern-cage-bar-${index}`);
  });
  [-0.13, 0.13].forEach((z, index) => {
    add(root, new THREE.CylinderGeometry(0.018, 0.018, 0.38, 6), brass, [-0.47, 1.22, 0.04 + z], [0, 0, 0], null, `aziz-lantern-cage-depth-${index}`);
  });
  root.userData.chroniclesCharacterId = 'bishop';
  root.userData.chroniclesSilhouette = 'bishop-lantern-seer';
  root.userData.chroniclesGlowMaterials = [glow];
  root.userData.chroniclesArtTier = 'premium-cast-v2';
  return root;
}

function buildMorcilla(segments) {
  const root = new THREE.Group();
  const detailSegments = Math.max(8, Math.round(segments * 0.55));
  const bone = material(0x9c8f79, { metalness: 0.05, roughness: 0.78 });
  const iron = material(0x4d5358, { metalness: 0.56, roughness: 0.38 });
  const leather = material(0x65422b, { roughness: 0.82 });
  const darkLeather = material(0x38251a, { roughness: 0.86 });
  const cloth = material(0x3d3330, { roughness: 0.78 });
  const copper = material(0x9a6036, { metalness: 0.55, roughness: 0.36 });
  const ink = material(0x080706, { metalness: 0, roughness: 0.92 });
  basePlinth(root, bone, iron, segments);
  lathe(root, [[0.38, 0.34], [0.31, 0.54], [0.28, 0.86], [0.32, 1.08]], cloth, segments, 'morcilla-logistics-body');
  const neck = new THREE.Group();
  neck.position.set(0, 1.05, 0);
  neck.rotation.x = -0.08;
  root.add(neck);
  add(neck, new THREE.CylinderGeometry(0.19, 0.24, 0.48, segments), bone, [0, 0.22, 0], [0.28, 0, 0], null, 'morcilla-knight-neck');
  add(neck, new THREE.SphereGeometry(0.25, segments, Math.max(12, segments / 2)), bone, [0, 0.46, 0.12], [0, 0, 0], [0.92, 0.82, 1.25], 'morcilla-knight-head');
  add(neck, new THREE.SphereGeometry(0.17, detailSegments, 8), bone, [0, 0.405, 0.38], [0, 0, 0], [0.92, 0.7, 1.25], 'morcilla-muzzle');
  add(neck, new THREE.ConeGeometry(0.065, 0.26, 8), bone, [-0.13, 0.69, 0.05], [0.16, 0, 0.08], null, 'morcilla-ear-left');
  add(neck, new THREE.ConeGeometry(0.065, 0.26, 8), bone, [0.13, 0.69, 0.05], [0.16, 0, -0.08], null, 'morcilla-ear-right');
  add(neck, new THREE.SphereGeometry(0.026, 8, 6), ink, [-0.085, 0.5, 0.36], [0, 0, 0], null, 'morcilla-eye-left');
  add(neck, new THREE.SphereGeometry(0.026, 8, 6), ink, [0.085, 0.5, 0.36], [0, 0, 0], null, 'morcilla-eye-right');
  add(neck, new THREE.SphereGeometry(0.018, 8, 6), ink, [-0.05, 0.39, 0.555], [0, 0, 0], [1.2, 0.6, 0.55], 'morcilla-nostril-left');
  add(neck, new THREE.SphereGeometry(0.018, 8, 6), ink, [0.05, 0.39, 0.555], [0, 0, 0], [1.2, 0.6, 0.55], 'morcilla-nostril-right');
  add(neck, new THREE.BoxGeometry(0.28, 0.12, 0.12), iron, [0, 0.48, 0.27], [0.12, 0, 0], null, 'morcilla-brow-plate');
  add(neck, new THREE.TorusGeometry(0.235, 0.024, 6, detailSegments), darkLeather, [0, 0.45, 0.15], [Math.PI / 2, 0, 0], [1, 1.18, 1], 'morcilla-bridle-band');
  add(neck, new THREE.BoxGeometry(0.025, 0.44, 0.018), darkLeather, [-0.13, 0.43, 0.32], [0.12, 0, 0.12], null, 'morcilla-bridle-left');
  add(neck, new THREE.BoxGeometry(0.025, 0.44, 0.018), darkLeather, [0.13, 0.43, 0.32], [0.12, 0, -0.12], null, 'morcilla-bridle-right');
  add(root, new THREE.BoxGeometry(0.3, 0.38, 0.18), leather, [-0.35, 0.78, -0.04], [0, 0.12, 0], null, 'morcilla-pack-left');
  add(root, new THREE.BoxGeometry(0.3, 0.38, 0.18), leather, [0.35, 0.78, -0.04], [0, -0.12, 0], null, 'morcilla-pack-right');
  add(root, new THREE.BoxGeometry(0.035, 0.75, 0.025), darkLeather, [-0.19, 0.79, 0.11], [0, 0, 0.18], null, 'morcilla-pack-strap-left');
  add(root, new THREE.BoxGeometry(0.035, 0.75, 0.025), darkLeather, [0.19, 0.79, 0.11], [0, 0, -0.18], null, 'morcilla-pack-strap-right');
  add(root, new THREE.CylinderGeometry(0.055, 0.055, 0.6, 8), copper, [0.4, 0.92, 0.04], [0, 0, 0.12], null, 'morcilla-tool-roll');
  root.userData.chroniclesCharacterId = 'knight';
  root.userData.chroniclesSilhouette = 'knight-quartermaster';
  root.userData.chroniclesArtTier = 'premium-cast-v2';
  return root;
}

export function buildChroniclesCharacter(memberId, { coarsePointer = false } = {}) {
  const segments = coarsePointer ? 18 : 30;
  if (memberId === 'rook') return buildHildegard(segments);
  if (memberId === 'bishop') return buildAziz(segments);
  if (memberId === 'knight') return buildMorcilla(segments);
  return buildMatthias(segments);
}

export function buildCorruptedPawn({ coarsePointer = false } = {}) {
  const segments = coarsePointer ? 14 : 24;
  const root = new THREE.Group();
  root.name = 'chronicles-corrupted-pawn';
  root.userData.chroniclesEnemy = 'corrupted-pawn';

  const blackIron = material(0x171a1d, { metalness: 0.68, roughness: 0.32, clearcoat: 0.12, envMapIntensity: 0.58 });
  const wornSteel = material(0x4b5358, { metalness: 0.74, roughness: 0.3, clearcoat: 0.08 });
  const leather = material(0x38261e, { metalness: 0.05, roughness: 0.86 });
  const cloth = material(0x4a2424, { metalness: 0.02, roughness: 0.9 });
  const glow = material(0x3a0607, { metalness: 0.05, roughness: 0.36, emissive: 0xe11920, emissiveIntensity: 1.95 });

  // Grounded humanoid mass: overlapping volumes remove the old stacked-chess-piece look.
  capsule(root, 0.105, 0.24, blackIron, [-0.17, 0.22, 0.02], [0, 0, -0.05], [1.05, 1, 0.9], 'corrupted-pawn-leg-left', segments);
  capsule(root, 0.105, 0.24, blackIron, [0.17, 0.22, 0.02], [0, 0, 0.05], [1.05, 1, 0.9], 'corrupted-pawn-leg-right', segments);
  add(root, new THREE.BoxGeometry(0.25, 0.14, 0.34), wornSteel, [-0.17, 0.07, 0.08], [0.03, 0, -0.02], null, 'corrupted-pawn-boot-left');
  add(root, new THREE.BoxGeometry(0.25, 0.14, 0.34), wornSteel, [0.17, 0.07, 0.08], [0.03, 0, 0.02], null, 'corrupted-pawn-boot-right');
  capsule(root, 0.29, 0.42, leather, [0, 0.74, -0.015], [0, 0, 0], [1.08, 1, 0.78], 'corrupted-pawn-mail-core', segments);
  add(root, new THREE.SphereGeometry(0.34, segments, Math.max(10, Math.floor(segments * 0.55))), blackIron, [0, 0.94, 0.03], [0, 0, 0], [1.14, 1.08, 0.72], 'corrupted-pawn-breastplate');
  add(root, new THREE.BoxGeometry(0.3, 0.54, 0.035), cloth, [0, 0.68, 0.285], [0, 0, 0], null, 'corrupted-pawn-tabard');
  add(root, new THREE.TorusGeometry(0.29, 0.035, 7, segments), wornSteel, [0, 0.64, 0], [Math.PI / 2, 0, 0], null, 'corrupted-pawn-belt');

  capsule(root, 0.095, 0.34, blackIron, [-0.39, 0.87, 0.015], [0, 0, -0.22], [1, 1, 0.92], 'corrupted-pawn-arm-left', segments);
  capsule(root, 0.095, 0.34, blackIron, [0.39, 0.87, 0.015], [0, 0, 0.22], [1, 1, 0.92], 'corrupted-pawn-arm-right', segments);
  add(root, new THREE.DodecahedronGeometry(0.19, 1), wornSteel, [-0.34, 1.08, 0], [0.08, 0, -0.28], [1.22, 0.62, 1], 'corrupted-pawn-pauldron-left');
  add(root, new THREE.DodecahedronGeometry(0.19, 1), wornSteel, [0.34, 1.08, 0], [-0.08, 0, 0.28], [1.22, 0.62, 1], 'corrupted-pawn-pauldron-right');

  const head = new THREE.Group();
  head.name = 'corrupted-pawn-head';
  head.position.set(0, 1.39, 0.015);
  root.add(head);
  add(head, new THREE.SphereGeometry(0.255, segments, Math.max(10, Math.floor(segments * 0.55))), blackIron, [0, 0, 0], [0, 0, 0], [1, 0.94, 0.92], 'corrupted-pawn-helmet');
  add(head, new THREE.BoxGeometry(0.42, 0.12, 0.095), wornSteel, [0, -0.01, 0.205], [0.02, 0, 0], null, 'corrupted-pawn-visor');
  add(head, new THREE.BoxGeometry(0.28, 0.036, 0.022), glow, [0, 0.005, 0.26], [0, 0, 0], null, 'corrupted-pawn-eye-slit');

  add(root, new THREE.TorusGeometry(0.31, 0.048, 8, segments), wornSteel, [0, 1.18, 0], [Math.PI / 2, 0, 0], null, 'corrupted-pawn-broken-collar');
  add(root, new THREE.ConeGeometry(0.075, 0.34, 9), wornSteel, [-0.36, 1.18, -0.03], [0.12, 0, -0.7], null, 'corrupted-pawn-spike-left');
  add(root, new THREE.ConeGeometry(0.075, 0.34, 9), wornSteel, [0.36, 1.18, -0.03], [-0.12, 0, 0.7], null, 'corrupted-pawn-spike-right');

  // Shield + short sword give the pawn a readable footsoldier silhouette.
  add(root, new THREE.CylinderGeometry(0.31, 0.31, 0.065, segments), blackIron, [-0.5, 0.72, 0.18], [Math.PI / 2, 0, 0.08], [1, 1.08, 1], 'corrupted-pawn-shield');
  add(root, new THREE.TorusGeometry(0.255, 0.025, 8, segments), wornSteel, [-0.5, 0.72, 0.217], [0, 0, 0.08], null, 'corrupted-pawn-shield-rim');
  add(root, new THREE.BoxGeometry(0.075, 0.52, 0.055), wornSteel, [0.48, 0.73, 0.06], [0, 0, -0.18], null, 'corrupted-pawn-sword-grip');
  add(root, new THREE.BoxGeometry(0.075, 0.64, 0.025), wornSteel, [0.56, 1.15, 0.07], [0, 0, -0.18], [0.72, 1, 1], 'corrupted-pawn-sword-blade');
  add(root, new THREE.BoxGeometry(0.27, 0.04, 0.04), wornSteel, [0.49, 0.95, 0.065], [0, 0, -0.18], null, 'corrupted-pawn-sword-guard');

  add(root, new THREE.BoxGeometry(0.045, 0.42, 0.025), glow, [-0.07, 0.92, 0.275], [0, 0, -0.16], null, 'corrupted-pawn-chest-fissure');
  add(root, new THREE.BoxGeometry(0.2, 0.032, 0.025), glow, [0.09, 0.78, 0.286], [0, 0, 0.42], null, 'corrupted-pawn-fissure-ring');

  root.userData.chroniclesGlowMaterials = [glow];
  root.userData.chroniclesBaseGlow = 1.95;
  root.userData.chroniclesSilhouette = 'corrupted-pawn-armoured-footman';
  root.userData.chroniclesArtTier = 'premium-threat-v3';
  root.userData.chroniclesEnemyId = 'corrupted-pawn';
  return root;
}

export function buildGateJailer({ coarsePointer = false } = {}) {
  const segments = coarsePointer ? 14 : 24;
  const root = new THREE.Group();
  root.name = 'chronicles-gate-jailer';
  root.userData.chroniclesEnemy = 'gate-jailer';

  const blackIron = material(0x14171a, { metalness: 0.72, roughness: 0.3, clearcoat: 0.12, envMapIntensity: 0.62 });
  const oldSteel = material(0x555b5f, { metalness: 0.76, roughness: 0.3 });
  const leather = material(0x33251f, { roughness: 0.86, metalness: 0.03 });
  const tabard = material(0x4a2222, { roughness: 0.9, metalness: 0.02 });
  const glow = material(0x3e0706, { roughness: 0.34, emissive: 0xe53622, emissiveIntensity: 2.15 });

  // Massive planted stance, but still recognisably humanoid.
  capsule(root, 0.145, 0.3, blackIron, [-0.22, 0.24, 0], [0, 0, -0.03], [1.08, 1, 0.95], 'gate-jailer-leg-left', segments);
  capsule(root, 0.145, 0.3, blackIron, [0.22, 0.24, 0], [0, 0, 0.03], [1.08, 1, 0.95], 'gate-jailer-leg-right', segments);
  add(root, new THREE.BoxGeometry(0.34, 0.18, 0.42), oldSteel, [-0.22, 0.07, 0.08], [0.02, 0, 0], null, 'gate-jailer-boot-left');
  add(root, new THREE.BoxGeometry(0.34, 0.18, 0.42), oldSteel, [0.22, 0.07, 0.08], [0.02, 0, 0], null, 'gate-jailer-boot-right');

  capsule(root, 0.39, 0.58, leather, [0, 0.82, -0.03], [0, 0, 0], [1.18, 1, 0.82], 'gate-jailer-mail-core', segments);
  add(root, new THREE.SphereGeometry(0.47, segments, Math.max(10, Math.floor(segments * 0.55))), blackIron, [0, 1.0, 0], [0, 0, 0], [1.18, 1.06, 0.72], 'gate-jailer-breastplate');
  add(root, new THREE.BoxGeometry(0.38, 0.72, 0.04), tabard, [0, 0.67, 0.39], [0, 0, 0], null, 'gate-jailer-tabard');
  add(root, new THREE.TorusGeometry(0.4, 0.052, 8, segments), oldSteel, [0, 0.67, 0], [Math.PI / 2, 0, 0], null, 'gate-jailer-belt');

  add(root, new THREE.DodecahedronGeometry(0.27, 1), oldSteel, [-0.46, 1.12, 0], [0.06, 0, -0.2], [1.34, 0.65, 1.08], 'gate-jailer-pauldron-left');
  add(root, new THREE.DodecahedronGeometry(0.27, 1), oldSteel, [0.46, 1.12, 0], [-0.06, 0, 0.2], [1.34, 0.65, 1.08], 'gate-jailer-pauldron-right');
  capsule(root, 0.12, 0.42, blackIron, [-0.52, 0.84, 0.01], [0, 0, -0.16], [1.05, 1, 0.94], 'gate-jailer-arm-left', segments);
  capsule(root, 0.12, 0.42, blackIron, [0.52, 0.84, 0.01], [0, 0, 0.16], [1.05, 1, 0.94], 'gate-jailer-arm-right', segments);

  const crown = new THREE.Group();
  crown.name = 'gate-jailer-crown';
  crown.position.set(0, 1.48, 0);
  root.add(crown);
  add(crown, new THREE.CylinderGeometry(0.34, 0.38, 0.38, segments), blackIron, [0, 0, 0], [0, 0, 0], null, 'gate-jailer-helm');
  add(crown, new THREE.BoxGeometry(0.52, 0.13, 0.1), oldSteel, [0, -0.02, 0.335], [0, 0, 0], null, 'gate-jailer-visor');
  add(crown, new THREE.BoxGeometry(0.31, 0.038, 0.024), glow, [0, -0.015, 0.39], [0, 0, 0], null, 'gate-jailer-eye-slit');
  for (let i = 0; i < 6; i += 1) {
    const angle = (i / 6) * Math.PI * 2;
    add(crown, new THREE.BoxGeometry(0.14, 0.24, 0.14), oldSteel,
      [Math.cos(angle) * 0.29, 0.27, Math.sin(angle) * 0.29],
      [0, -angle, 0], null, 'gate-jailer-crenel-' + i);
  }

  // Chest grate reads as prison-warden iconography, not floating bars.
  const portcullis = new THREE.Group();
  portcullis.name = 'gate-jailer-portcullis';
  portcullis.position.set(0, 0, 0);
  root.add(portcullis);
  [-0.16, 0, 0.16].forEach((x, index) => {
    add(portcullis, new THREE.BoxGeometry(0.045, 0.5, 0.04), oldSteel, [x, 0.94, 0.405], [0, 0, 0], null, 'gate-jailer-grate-bar-' + index);
  });
  add(portcullis, new THREE.BoxGeometry(0.4, 0.045, 0.04), oldSteel, [0, 0.78, 0.405], [0, 0, 0], null, 'gate-jailer-grate-low');
  add(portcullis, new THREE.BoxGeometry(0.4, 0.045, 0.04), oldSteel, [0, 1.07, 0.405], [0, 0, 0], null, 'gate-jailer-grate-high');
  add(portcullis, new THREE.SphereGeometry(0.075, 10, 7), glow, [0, 0.92, 0.41], [0, 0, 0], [1.2, 1.55, 0.4], 'gate-jailer-core');

  // Brutal key-cleaver and hanging cage-lantern form the asymmetrical silhouette.
  const keyBlade = new THREE.Group();
  keyBlade.name = 'gate-jailer-key-blade';
  keyBlade.position.set(-0.58, 0.76, 0.02);
  keyBlade.rotation.z = -0.12;
  root.add(keyBlade);
  add(keyBlade, new THREE.CylinderGeometry(0.055, 0.065, 0.78, 8), oldSteel, [0, 0.06, 0], [0, 0, 0], null, 'gate-jailer-cleaver-haft');
  add(keyBlade, new THREE.BoxGeometry(0.24, 0.56, 0.08), oldSteel, [-0.04, 0.54, 0], [0, 0, -0.06], null, 'gate-jailer-cleaver-blade');
  add(keyBlade, new THREE.BoxGeometry(0.18, 0.16, 0.09), blackIron, [0.09, 0.72, 0], [0, 0, 0], null, 'gate-jailer-cleaver-tooth');

  const cage = new THREE.Group();
  cage.position.set(0.58, 0.68, 0.08);
  root.add(cage);
  add(cage, new THREE.BoxGeometry(0.34, 0.42, 0.28), blackIron, [0, 0, 0], [0, 0, 0], null, 'gate-jailer-cage-core');
  [-0.12, 0.12].forEach((x, index) => {
    add(cage, new THREE.BoxGeometry(0.035, 0.5, 0.035), oldSteel, [x, 0, 0.155], [0, 0, 0], null, 'gate-jailer-cage-bar-' + index);
  });
  add(cage, new THREE.SphereGeometry(0.075, 10, 7), glow, [0, 0, 0.18], [0, 0, 0], null, 'gate-jailer-cage-ember');

  for (let i = 0; i < (coarsePointer ? 2 : 4); i += 1) {
    const link = add(root, new THREE.TorusGeometry(0.1, 0.024, 6, coarsePointer ? 10 : 14), oldSteel,
      [0.36 + i * 0.055, 1.2 - i * 0.16, -0.16],
      [Math.PI / 2, 0, i % 2 ? Math.PI / 2 : 0], null, 'gate-jailer-chain-' + i);
    link.scale.y = 1.25;
  }

  root.userData.chroniclesGlowMaterials = [glow];
  root.userData.chroniclesBaseGlow = 2.15;
  root.userData.chroniclesSilhouette = 'rook-jailer-armoured-warden';
  root.userData.chroniclesArtTier = 'premium-threat-v3';
  root.userData.chroniclesEnemyId = 'gate-jailer';
  return root;
}
